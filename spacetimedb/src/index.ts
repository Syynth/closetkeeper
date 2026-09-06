import { Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import { defineAdminReducer } from "./admin-reducer";
import {
	type Ctx,
	noteConnection,
	type ReadCtx,
	requireSensitiveIfProtected,
	resolveStaff,
	roleCapabilities,
	roleHoldsProtected,
	wouldLockOut,
} from "./auth";
import {
	BOOTSTRAP_ROLE_KEY,
	CAPABILITIES,
	CAPABILITY_INFO,
	describeLogin,
	isCapability,
	isProtected,
	isValidRoleKey,
	looksLikeEmail,
	normalizeEmail,
	SYSTEM_ROLES,
} from "./auth-rules";
import { TRUSTED_ISSUER } from "./config";
import spacetimedb, { ACCESS_EVENT_PURGE_INTERVAL } from "./schema";

export default spacetimedb;
export { purgeAccessEvents } from "./schema";

/** Sentinel for `invited_by` and `actor_staff_id` when the module itself acted. */
const SYSTEM = 0n;
/** Epoch 0: "has not happened". */
const NEVER = new Timestamp(0n);

/**
 * Runs exactly once, when the database is first created. `ctx.sender` here is
 * the identity that published the module, so the publisher becomes the first
 * super-admin. No email or name is baked into the module; the deployer
 * invites real people afterwards (CI does this from a repository secret).
 *
 * Because init never runs again, a database created before this seed existed
 * must be recreated to receive it.
 */
export const init = spacetimedb.init((ctx) => {
	const roleIds = new Map<string, bigint>();
	for (const spec of SYSTEM_ROLES) {
		const row = ctx.db.role.insert({
			id: 0n,
			key: spec.key,
			label: spec.label,
			description: spec.description,
			system: true,
			created_at: ctx.timestamp,
		});
		roleIds.set(spec.key, row.id);
		for (const capability of spec.capabilities) {
			ctx.db.role_capability.insert({ id: 0n, role_id: row.id, capability });
		}
	}
	const bootstrapRoleId = roleIds.get(BOOTSTRAP_ROLE_KEY);
	if (bootstrapRoleId === undefined)
		throw new Error("bootstrap role missing from SYSTEM_ROLES");

	const person = ctx.db.person.insert({
		id: 0n,
		display_name: "Publisher",
		email: "",
		notes: "Seeded by init: the identity that first published the module.",
		created_at: ctx.timestamp,
	});
	const jwt = ctx.senderAuth.jwt;
	ctx.db.auth_provider_link.insert({
		id: 0n,
		identity: ctx.sender,
		issuer: jwt?.issuer ?? "",
		subject: jwt?.subject ?? "",
		person_id: person.id,
		created_at: ctx.timestamp,
		last_seen_at: ctx.timestamp,
	});
	const staff = ctx.db.staff_member.insert({
		id: 0n,
		person_id: person.id,
		role_id: bootstrapRoleId,
		active: true,
		invited_at: ctx.timestamp,
		invited_by: SYSTEM,
		welcomed_at: ctx.timestamp,
	});

	ctx.db.access_event_purge_schedule.insert({
		scheduled_id: 0n,
		scheduled_at: ACCESS_EVENT_PURGE_INTERVAL,
	});

	ctx.db.audit_event.insert({
		id: 0n,
		at: ctx.timestamp,
		actor_staff_id: SYSTEM,
		action: "init",
		target_table: "staff_member",
		target_id: staff.id,
		details: JSON.stringify({ roles: SYSTEM_ROLES.map((r) => r.key) }),
	});
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
	noteConnection(ctx);
});

export const onDisconnect = spacetimedb.clientDisconnected(() => {
	// Nothing to record. Connections are ephemeral; logins are not.
});

/** The caller's own standing. Exactly one row, the caller's, or nothing. */
const MyStaffRow = t.row("StaffStanding", {
	staff_id: t.u64().primaryKey(),
	person_id: t.u64(),
	display_name: t.string(),
	role_key: t.string(),
	role_label: t.string(),
	role_description: t.string(),
	active: t.bool(),
	capabilities: t.array(t.string()),
	/** Plain-English labels, same order as `capabilities`. */
	capability_labels: t.array(t.string()),
	/** False until the person has finished their first-visit welcome. */
	welcomed: t.bool(),
});

/**
 * Every table here is private, so this per-user view is how the admin app
 * learns whether the person in front of it is staff, which role they hold,
 * and what they may do. It exposes nothing about anyone else.
 */
export const myStaff = spacetimedb.view(
	{ name: "my_staff", public: true },
	t.option(MyStaffRow),
	(ctx) => {
		const link = ctx.db.auth_provider_link.identity.find(ctx.sender);
		if (link === null) return undefined;
		const staff = ctx.db.staff_member.person_id.find(link.person_id);
		if (staff === null) return undefined;
		const role = ctx.db.role.id.find(staff.role_id);
		if (role === null) return undefined;
		const capabilities: string[] = [];
		for (const rc of ctx.db.role_capability.role_id.filter(role.id))
			capabilities.push(rc.capability);
		capabilities.sort();
		const person = ctx.db.person.id.find(staff.person_id);
		return {
			staff_id: staff.id,
			person_id: staff.person_id,
			display_name: person?.display_name ?? "",
			role_key: role.key,
			role_label: role.label,
			role_description: role.description,
			active: staff.active,
			capabilities,
			capability_labels: capabilities.map((c) =>
				isCapability(c) ? CAPABILITY_INFO[c].label : c,
			),
			welcomed: staff.welcomed_at.microsSinceUnixEpoch > 0n,
		};
	},
);

/** One staff member as seen by someone who manages staff. */
const StaffDirectoryRow = t.row("StaffDirectoryEntry", {
	staff_id: t.u64().primaryKey(),
	person_id: t.u64(),
	display_name: t.string(),
	email: t.string(),
	role_key: t.string(),
	role_label: t.string(),
	active: t.bool(),
	invited_at: t.timestamp(),
	/** Whether any login is linked to this person yet. */
	has_signed_in: t.bool(),
	/** Most recent connection by any of this person's logins; epoch 0 when none. */
	last_seen_at: t.timestamp(),
	/** Whether they have finished their first-visit welcome. */
	welcomed: t.bool(),
});

/** Latest last_seen_at across a person's logins, or epoch 0 when they have none. */
function lastSeenForPerson(
	ctx: ReadCtx,
	personId: bigint,
): { hasLogin: boolean; at: Timestamp } {
	let hasLogin = false;
	let latest = 0n;
	for (const link of ctx.db.auth_provider_link.person_id.filter(personId)) {
		hasLogin = true;
		if (link.last_seen_at.microsSinceUnixEpoch > latest)
			latest = link.last_seen_at.microsSinceUnixEpoch;
	}
	return { hasLogin, at: new Timestamp(latest) };
}

/**
 * Every staff member, for callers holding staff.manage; nothing for anyone
 * else. Staff names and emails are staff data, not family data, and the
 * people who manage staff need them to do it. Last sign-in is a coarse
 * timestamp so a manager can tell whether an invitation was ever used; the
 * full access log needs access.read.
 */
export const staffDirectory = spacetimedb.view(
	{ name: "staff_directory", public: true },
	t.array(StaffDirectoryRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null || !me.capabilities.has("staff.manage")) return [];
		const out = [];
		for (const s of ctx.db.staff_member.iter()) {
			const person = ctx.db.person.id.find(s.person_id);
			const role = ctx.db.role.id.find(s.role_id);
			if (person === null || role === null) continue;
			const seen = lastSeenForPerson(ctx, s.person_id);
			out.push({
				staff_id: s.id,
				person_id: s.person_id,
				display_name: person.display_name,
				email: person.email,
				role_key: role.key,
				role_label: role.label,
				active: s.active,
				invited_at: s.invited_at,
				has_signed_in: seen.hasLogin,
				last_seen_at: seen.at,
				welcomed: s.welcomed_at.microsSinceUnixEpoch > 0n,
			});
		}
		return out;
	},
);

/** A role as offered in the invite form. */
const RoleOptionRow = t.row("RoleOption", {
	role_id: t.u64().primaryKey(),
	key: t.string(),
	label: t.string(),
	description: t.string(),
	system: t.bool(),
	protected: t.bool(),
	/** Active staff members currently in this role. */
	holders: t.u32(),
});

/**
 * The roles a caller may assign. Everyone with staff.manage sees every
 * role; the `protected` flag tells the UI which ones additionally need
 * staff.manage_sensitive, so it can explain a refusal before it happens.
 */
export const roleOptions = spacetimedb.view(
	{ name: "role_options", public: true },
	t.array(RoleOptionRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null || !me.capabilities.has("staff.manage")) return [];
		const out = [];
		for (const role of ctx.db.role.iter()) {
			out.push({
				role_id: role.id,
				key: role.key,
				label: role.label,
				description: role.description,
				system: role.system,
				protected: roleHoldsProtected(ctx, role.id),
				holders: [...ctx.db.staff_member.role_id.filter(role.id)].filter(
					(m) => m.active,
				).length,
			});
		}
		return out;
	},
);

/** One switch on the Role screen: a role × capability cell. */
const RoleCapabilityCell = t.row("RoleCapabilityCell", {
	/** `${role_id}:${capability}`; views need a primary key. */
	key: t.string().primaryKey(),
	role_id: t.u64(),
	capability: t.string(),
	group: t.string(),
	label: t.string(),
	protected: t.bool(),
	granted: t.bool(),
});

/**
 * Every role × every capability, with whether it is granted and how it is
 * described. For callers holding role.manage; nothing for anyone else.
 */
export const roleCapabilityMatrix = spacetimedb.view(
	{ name: "role_capability_matrix", public: true },
	t.array(RoleCapabilityCell),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null || !me.capabilities.has("role.manage")) return [];
		const out = [];
		for (const role of ctx.db.role.iter()) {
			const held = roleCapabilities(ctx, role.id);
			for (const capability of CAPABILITIES) {
				const info = CAPABILITY_INFO[capability];
				out.push({
					key: `${role.id}:${capability}`,
					role_id: role.id,
					capability,
					group: info.group,
					label: info.label,
					protected: isProtected(capability),
					granted: held.has(capability),
				});
			}
		}
		return out;
	},
);

/** The caller's own person record. */
const MyAccountRow = t.row("AccountDetails", {
	person_id: t.u64().primaryKey(),
	display_name: t.string(),
	email: t.string(),
	role_key: t.string(),
	role_label: t.string(),
});

export const myAccount = spacetimedb.view(
	{ name: "my_account", public: true },
	t.option(MyAccountRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null) return undefined;
		const person = ctx.db.person.id.find(me.personId);
		if (person === null) return undefined;
		return {
			person_id: person.id,
			display_name: person.display_name,
			email: person.email,
			role_key: me.roleKey,
			role_label: ctx.db.role.id.find(me.roleId)?.label ?? me.roleKey,
		};
	},
);

/** One of the caller's ways to sign in. */
const MyLoginRow = t.row("LoginEntry", {
	link_id: t.u64().primaryKey(),
	label: t.string(),
	created_at: t.timestamp(),
	last_seen_at: t.timestamp(),
	/** True for the login this connection is using. It cannot be removed. */
	current: t.bool(),
});

/** Every login linked to the caller's person; nothing for a stranger. */
export const myLogins = spacetimedb.view(
	{ name: "my_logins", public: true },
	t.array(MyLoginRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null) return [];
		const out = [];
		for (const link of ctx.db.auth_provider_link.person_id.filter(
			me.personId,
		)) {
			out.push({
				link_id: link.id,
				label: describeLogin(link.issuer, TRUSTED_ISSUER),
				created_at: link.created_at,
				last_seen_at: link.last_seen_at,
				current: link.identity.isEqual(ctx.sender),
			});
		}
		return out;
	},
);

/** One of the caller's own recent connections. */
const MySignInRow = t.row("SignInEntry", {
	event_id: t.u64().primaryKey(),
	at: t.timestamp(),
	login_label: t.string(),
	outcome: t.string(),
});

const MY_SIGN_INS_LIMIT = 20;

/** The caller's most recent connections across all their logins, newest first. */
export const myRecentSignIns = spacetimedb.view(
	{ name: "my_recent_sign_ins", public: true },
	t.array(MySignInRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null) return [];
		const rows = [];
		for (const link of ctx.db.auth_provider_link.person_id.filter(
			me.personId,
		)) {
			const label = describeLogin(link.issuer, TRUSTED_ISSUER);
			for (const ev of ctx.db.access_event.identity.filter(link.identity)) {
				rows.push({
					event_id: ev.id,
					at: ev.at,
					login_label: label,
					outcome: ev.outcome,
				});
			}
		}
		rows.sort((a, b) =>
			Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
		);
		return rows.slice(0, MY_SIGN_INS_LIMIT);
	},
);

/** One row of the access log, as shown to a system administrator. */
const AccessLogRow = t.row("AccessLogEntry", {
	event_id: t.u64().primaryKey(),
	at: t.timestamp(),
	identity_hex: t.string(),
	issuer: t.string(),
	email: t.string(),
	outcome: t.string(),
	/** Display name when the identity resolves to a person; empty otherwise. */
	display_name: t.string(),
});

const ACCESS_LOG_LIMIT = 200;

/**
 * The door's record, newest first, for callers holding access.read. It
 * carries the email of anyone who tried to sign in with a trusted token and
 * wasn't invited, which is what makes the log actionable, and why the
 * capability is protected.
 */
export const accessLog = spacetimedb.view(
	{ name: "access_log", public: true },
	t.array(AccessLogRow),
	(ctx) => {
		const me = resolveStaff(ctx);
		if (me === null || !me.capabilities.has("access.read")) return [];
		const rows = [];
		for (const ev of ctx.db.access_event.iter()) {
			const link = ctx.db.auth_provider_link.identity.find(ev.identity);
			const person =
				link === null ? null : ctx.db.person.id.find(link.person_id);
			rows.push({
				event_id: ev.id,
				at: ev.at,
				identity_hex: ev.identity.toHexString(),
				issuer: ev.issuer,
				email: ev.email,
				outcome: ev.outcome,
				display_name: person?.display_name ?? "",
			});
		}
		rows.sort((a, b) =>
			Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
		);
		return rows.slice(0, ACCESS_LOG_LIMIT);
	},
);

function findRoleByKey(ctx: Ctx, key: string) {
	const role = ctx.db.role.key.find(key);
	if (role === null) throw new SenderError(`unknown role: ${key}`);
	return role;
}

/**
 * Invite someone as staff by email. They become authorized the first time
 * they log in with that email through a trusted provider. If a person with
 * this email already exists they are reused, so a family contact who later
 * volunteers keeps one person record.
 *
 * Idempotent: inviting someone who is already an active staff member in
 * the same role is a no-op, so CI can run it after every publish.
 */
export const inviteStaff = defineAdminReducer(
	{
		name: "invite_staff",
		capability: "staff.manage",
		args: { email: t.string(), display_name: t.string(), role_key: t.string() },
		redact: ["email", "display_name"],
	},
	(ctx, inviter, { email, display_name, role_key }) => {
		const role = findRoleByKey(ctx, role_key);
		requireSensitiveIfProtected(ctx, inviter, role.id);
		if (!looksLikeEmail(email)) throw new SenderError("invalid email");
		const normalized = normalizeEmail(email);

		let person = [...ctx.db.person.email.filter(normalized)][0] ?? null;
		if (person === null) {
			person = ctx.db.person.insert({
				id: 0n,
				display_name: display_name.trim(),
				email: normalized,
				notes: "",
				created_at: ctx.timestamp,
			});
		}
		const existing = ctx.db.staff_member.person_id.find(person.id);
		if (existing !== null) {
			if (existing.active && existing.role_id === role.id) {
				return {
					table: "staff_member",
					id: existing.id,
					details: { noop: true },
				};
			}
			throw new SenderError(
				"already a staff member; use set_staff_active or set_staff_role",
			);
		}
		const staff = ctx.db.staff_member.insert({
			id: 0n,
			person_id: person.id,
			role_id: role.id,
			active: true,
			invited_at: ctx.timestamp,
			invited_by: inviter.staffId,
			welcomed_at: NEVER,
		});
		return {
			table: "staff_member",
			id: staff.id,
			details: { person_id: person.id, role_id: role.id },
		};
	},
);

/**
 * Activate or deactivate a staff member. Deactivation keeps the row so the
 * audit trail survives, but every reducer refuses them immediately. Refused
 * if it would leave nobody who can manage sensitive access.
 */
export const setStaffActive = defineAdminReducer(
	{
		name: "set_staff_active",
		capability: "staff.manage",
		args: { staff_id: t.u64(), active: t.bool() },
	},
	(ctx, actor, { staff_id, active }) => {
		const row = ctx.db.staff_member.id.find(staff_id);
		if (row === null) throw new SenderError("no such staff member");
		requireSensitiveIfProtected(ctx, actor, row.role_id);
		if (!active && wouldLockOut(ctx, staff_id)) {
			throw new SenderError(
				"refused: nobody else could manage sensitive access",
			);
		}
		ctx.db.staff_member.id.update({ ...row, active });
		return { table: "staff_member", id: staff_id };
	},
);

/** Change a staff member's role. Same lockout guard as set_staff_active. */
export const setStaffRole = defineAdminReducer(
	{
		name: "set_staff_role",
		capability: "staff.manage",
		args: { staff_id: t.u64(), role_key: t.string() },
	},
	(ctx, actor, { staff_id, role_key }) => {
		const row = ctx.db.staff_member.id.find(staff_id);
		if (row === null) throw new SenderError("no such staff member");
		const role = findRoleByKey(ctx, role_key);
		requireSensitiveIfProtected(ctx, actor, row.role_id);
		requireSensitiveIfProtected(ctx, actor, role.id);
		const losesSensitive = !roleCapabilities(ctx, role.id).has(
			"staff.manage_sensitive",
		);
		if (losesSensitive && wouldLockOut(ctx, staff_id)) {
			throw new SenderError(
				"refused: nobody else could manage sensitive access",
			);
		}
		ctx.db.staff_member.id.update({ ...row, role_id: role.id });
		return {
			table: "staff_member",
			id: staff_id,
			details: { role_id: role.id },
		};
	},
);

export const createRole = defineAdminReducer(
	{
		name: "create_role",
		capability: "role.manage",
		args: { key: t.string(), label: t.string(), description: t.string() },
	},
	(ctx, _actor, { key, label, description }) => {
		if (!isValidRoleKey(key)) throw new SenderError("invalid role key");
		if (ctx.db.role.key.find(key) !== null)
			throw new SenderError("role key already exists");
		const role = ctx.db.role.insert({
			id: 0n,
			key,
			label: label.trim(),
			description: description.trim(),
			system: false,
			created_at: ctx.timestamp,
		});
		return { table: "role", id: role.id };
	},
);

export const updateRole = defineAdminReducer(
	{
		name: "update_role",
		capability: "role.manage",
		args: { role_id: t.u64(), label: t.string(), description: t.string() },
	},
	(ctx, _actor, { role_id, label, description }) => {
		const role = ctx.db.role.id.find(role_id);
		if (role === null) throw new SenderError("no such role");
		ctx.db.role.id.update({
			...role,
			label: label.trim(),
			description: description.trim(),
		});
		return { table: "role", id: role_id };
	},
);

/** Refuses system roles and roles anyone still holds. */
export const deleteRole = defineAdminReducer(
	{
		name: "delete_role",
		capability: "role.manage",
		args: { role_id: t.u64() },
	},
	(ctx, _actor, { role_id }) => {
		const role = ctx.db.role.id.find(role_id);
		if (role === null) throw new SenderError("no such role");
		if (role.system) throw new SenderError("system roles cannot be deleted");
		if ([...ctx.db.staff_member.role_id.filter(role_id)].length > 0) {
			throw new SenderError("role is still assigned to staff");
		}
		for (const rc of [...ctx.db.role_capability.role_id.filter(role_id)]) {
			ctx.db.role_capability.id.delete(rc.id);
		}
		ctx.db.role.id.delete(role_id);
		return { table: "role", id: role_id };
	},
);

/** Granting a protected capability additionally requires staff.manage_sensitive. */
export const grantCapability = defineAdminReducer(
	{
		name: "grant_capability",
		capability: "role.manage",
		args: { role_id: t.u64(), capability: t.string() },
	},
	(ctx, actor, { role_id, capability }) => {
		if (!isCapability(capability))
			throw new SenderError(`unknown capability: ${capability}`);
		if (ctx.db.role.id.find(role_id) === null)
			throw new SenderError("no such role");
		if (
			isProtected(capability) &&
			!actor.capabilities.has("staff.manage_sensitive")
		) {
			throw new SenderError("not authorized: granting a protected capability");
		}
		if (!roleCapabilities(ctx, role_id).has(capability)) {
			ctx.db.role_capability.insert({ id: 0n, role_id, capability });
		}
		return {
			table: "role",
			id: role_id,
			details: { protected: isProtected(capability) },
		};
	},
);

/** The super_admin role can never lose a capability. */
export const revokeCapability = defineAdminReducer(
	{
		name: "revoke_capability",
		capability: "role.manage",
		args: { role_id: t.u64(), capability: t.string() },
	},
	(ctx, _actor, { role_id, capability }) => {
		if (!isCapability(capability))
			throw new SenderError(`unknown capability: ${capability}`);
		const role = ctx.db.role.id.find(role_id);
		if (role === null) throw new SenderError("no such role");
		if (role.key === BOOTSTRAP_ROLE_KEY)
			throw new SenderError("system_admin keeps every capability");
		for (const rc of [...ctx.db.role_capability.role_id.filter(role_id)]) {
			if (rc.capability === capability) ctx.db.role_capability.id.delete(rc.id);
		}
		return { table: "role", id: role_id };
	},
);

/**
 * Edit a staff member's name and email. The email is the door: a changed
 * address is what future sign-ins must match, while logins already linked
 * keep working. Refused if another person already has that email.
 */
export const setStaffPerson = defineAdminReducer(
	{
		name: "set_staff_person",
		capability: "staff.manage",
		args: { staff_id: t.u64(), display_name: t.string(), email: t.string() },
		redact: ["display_name", "email"],
	},
	(ctx, actor, { staff_id, display_name, email }) => {
		const row = ctx.db.staff_member.id.find(staff_id);
		if (row === null) throw new SenderError("no such staff member");
		requireSensitiveIfProtected(ctx, actor, row.role_id);
		const person = ctx.db.person.id.find(row.person_id);
		if (person === null) throw new SenderError("no such person");
		if (!looksLikeEmail(email)) throw new SenderError("invalid email");
		const normalized = normalizeEmail(email);
		for (const other of ctx.db.person.email.filter(normalized)) {
			if (other.id !== person.id)
				throw new SenderError("another person already has that email");
		}
		const name = display_name.trim();
		if (name.length === 0) throw new SenderError("name is required");
		ctx.db.person.id.update({
			...person,
			display_name: name,
			email: normalized,
		});
		return {
			table: "person",
			id: person.id,
			details: { email_changed: normalized !== person.email },
		};
	},
);

/** Rename yourself. Any active staff member may. */
export const updateMyName = defineAdminReducer(
	{
		name: "update_my_name",
		capability: "any-staff",
		args: { display_name: t.string() },
		redact: ["display_name"],
	},
	(ctx, me, { display_name }) => {
		const person = ctx.db.person.id.find(me.personId);
		if (person === null) throw new SenderError("no such person");
		const name = display_name.trim();
		if (name.length === 0) throw new SenderError("name is required");
		ctx.db.person.id.update({ ...person, display_name: name });
		return { table: "person", id: person.id };
	},
);

/**
 * Remove one of your own logins. Refuses the login this connection is
 * using, and refuses your last one: either would lock you out on the spot.
 */
export const removeMyLogin = defineAdminReducer(
	{
		name: "remove_my_login",
		capability: "any-staff",
		args: { link_id: t.u64() },
	},
	(ctx, me, { link_id }) => {
		const link = ctx.db.auth_provider_link.id.find(link_id);
		if (link === null || link.person_id !== me.personId)
			throw new SenderError("no such login");
		if (link.identity.isEqual(ctx.sender))
			throw new SenderError("that is the login you are using now");
		if (
			[...ctx.db.auth_provider_link.person_id.filter(me.personId)].length <= 1
		) {
			throw new SenderError("that is your only login");
		}
		ctx.db.auth_provider_link.id.delete(link_id);
		return { table: "auth_provider_link", id: link_id };
	},
);

/**
 * The first-visit welcome: confirm your name and mark the welcome done.
 * Any active staff member may; running it again just re-saves the name.
 */
export const finishWelcome = defineAdminReducer(
	{
		name: "finish_welcome",
		capability: "any-staff",
		args: { display_name: t.string() },
		redact: ["display_name"],
	},
	(ctx, me, { display_name }) => {
		const person = ctx.db.person.id.find(me.personId);
		const staff = ctx.db.staff_member.id.find(me.staffId);
		if (person === null || staff === null)
			throw new SenderError("no such person");
		const name = display_name.trim();
		if (name.length === 0) throw new SenderError("name is required");
		ctx.db.person.id.update({ ...person, display_name: name });
		const first = staff.welcomed_at.microsSinceUnixEpoch === 0n;
		if (first)
			ctx.db.staff_member.id.update({ ...staff, welcomed_at: ctx.timestamp });
		return {
			table: "staff_member",
			id: staff.id,
			details: { first_visit: first },
		};
	},
);
