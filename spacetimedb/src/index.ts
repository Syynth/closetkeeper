import { SenderError, t } from "spacetimedb/server";
import { defineAdminReducer } from "./admin-reducer";
import {
	type Ctx,
	noteConnection,
	requireSensitiveIfProtected,
	roleCapabilities,
	wouldLockOut,
} from "./auth";
import {
	BOOTSTRAP_ROLE_KEY,
	isCapability,
	isProtected,
	isValidRoleKey,
	looksLikeEmail,
	normalizeEmail,
	SYSTEM_ROLES,
} from "./auth-rules";
import spacetimedb, { ACCESS_EVENT_PURGE_INTERVAL } from "./schema";

export default spacetimedb;
export { purgeAccessEvents } from "./schema";

/** Sentinel for `invited_by` and `actor_staff_id` when the module itself acted. */
const SYSTEM = 0n;

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
	role_key: t.string(),
	role_label: t.string(),
	active: t.bool(),
	capabilities: t.array(t.string()),
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
		return {
			staff_id: staff.id,
			person_id: staff.person_id,
			role_key: role.key,
			role_label: role.label,
			active: staff.active,
			capabilities: capabilities.sort(),
		};
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
