import { SenderError, t } from "spacetimedb/server";
import { noteConnection, requireStaff } from "./auth";
import { isRole, looksLikeEmail, normalizeEmail } from "./auth-rules";
import spacetimedb, { staffMemberRow } from "./schema";

export default spacetimedb;

/** Sentinel for `invited_by` when the module itself created the row. */
const SYSTEM = 0n;

/**
 * Runs exactly once, when the database is first created. `ctx.sender` here is
 * the identity that published the module, so the publisher becomes the first
 * staff member. No email or name is baked into the module; the deployer
 * invites real people afterwards (CI does this from a repository secret).
 *
 * Because init never runs again, a database created before this seed existed
 * must be recreated to receive it.
 */
export const init = spacetimedb.init((ctx) => {
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
	ctx.db.staff_member.insert({
		id: 0n,
		person_id: person.id,
		role: "staff",
		active: true,
		invited_at: ctx.timestamp,
		invited_by: SYSTEM,
	});
});

/**
 * The caller's own staff row, or nothing. Every table here is private, so
 * this per-user view is how the admin app learns whether the person in front
 * of it is staff and which role they hold. It exposes exactly one row, the
 * caller's, and nothing about anyone else.
 */
export const myStaff = spacetimedb.view(
	{ name: "my_staff", public: true },
	t.option(staffMemberRow),
	(ctx) => {
		const link = ctx.db.auth_provider_link.identity.find(ctx.sender);
		if (link === null) return undefined;
		return ctx.db.staff_member.person_id.find(link.person_id) ?? undefined;
	},
);

export const onConnect = spacetimedb.clientConnected((ctx) => {
	noteConnection(ctx);
});

export const onDisconnect = spacetimedb.clientDisconnected(() => {
	// Nothing to record. Connections are ephemeral; logins are not.
});

/**
 * Invite someone as staff by email. They become authorized the first time
 * they log in with that email through a trusted provider. If a person with
 * this email already exists they are reused, so a family contact who later
 * volunteers keeps one person record.
 *
 * Idempotent: inviting someone who is already an active staff member with
 * the same role is a no-op, so CI can run it after every publish.
 */
export const inviteStaff = spacetimedb.reducer(
	{ email: t.string(), display_name: t.string(), role: t.string() },
	(ctx, { email, display_name, role }) => {
		const inviter = requireStaff(ctx, "staff.manage");
		if (!isRole(role)) throw new SenderError(`unknown role: ${role}`);
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
			if (existing.active && existing.role === role) return;
			throw new SenderError(
				"already a staff member; use setStaffActive or setStaffRole",
			);
		}
		ctx.db.staff_member.insert({
			id: 0n,
			person_id: person.id,
			role,
			active: true,
			invited_at: ctx.timestamp,
			invited_by: inviter.staffId,
		});
	},
);

/**
 * Activate or deactivate a staff member. Deactivation keeps the row so the
 * audit trail survives, but every reducer refuses them immediately. A staff
 * member cannot deactivate themselves; that would let the last staff member
 * lock everyone out.
 */
export const setStaffActive = spacetimedb.reducer(
	{ staff_id: t.u64(), active: t.bool() },
	(ctx, { staff_id, active }) => {
		const actor = requireStaff(ctx, "staff.manage");
		if (staff_id === actor.staffId)
			throw new SenderError("cannot change your own status");
		const row = ctx.db.staff_member.id.find(staff_id);
		if (row === null) throw new SenderError("no such staff member");
		ctx.db.staff_member.id.update({ ...row, active });
	},
);

/** Change a staff member's role. Same self-lockout rule as setStaffActive. */
export const setStaffRole = spacetimedb.reducer(
	{ staff_id: t.u64(), role: t.string() },
	(ctx, { staff_id, role }) => {
		const actor = requireStaff(ctx, "staff.manage");
		if (!isRole(role)) throw new SenderError(`unknown role: ${role}`);
		if (staff_id === actor.staffId)
			throw new SenderError("cannot change your own role");
		const row = ctx.db.staff_member.id.find(staff_id);
		if (row === null) throw new SenderError("no such staff member");
		ctx.db.staff_member.id.update({ ...row, role });
	},
);
