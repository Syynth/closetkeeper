/**
 * Authorization against the database. Every admin reducer starts with
 * `requireStaff(ctx, capability)`, applied for it by defineAdminReducer;
 * there is no other path to "is this caller ours". Connecting grants nothing
 * (see noteConnection).
 */
import {
	type InferSchema,
	type ReducerCtx,
	SenderError,
	type ViewCtx,
} from "spacetimedb/server";
import {
	type AccessOutcome,
	type Capability,
	inspectToken,
	isCapability,
	isProtected,
} from "./auth-rules";
import { TRUSTED_CLIENT_IDS, TRUSTED_ISSUER } from "./config";
import type spacetimedb from "./schema";

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
/** Read-only helpers accept a view context too, so views can resolve the caller. */
export type ReadCtx = Ctx | ViewCtx<InferSchema<typeof spacetimedb>>;

export interface StaffContext {
	personId: bigint;
	staffId: bigint;
	roleId: bigint;
	roleKey: string;
	capabilities: ReadonlySet<Capability>;
}

/** Every capability a role holds, ignoring unknown strings defensively. */
export function roleCapabilities(
	ctx: ReadCtx,
	roleId: bigint,
): Set<Capability> {
	const out = new Set<Capability>();
	for (const rc of ctx.db.role_capability.role_id.filter(roleId)) {
		if (isCapability(rc.capability)) out.add(rc.capability);
	}
	return out;
}

/** Whether a role holds any protected capability (see auth-rules.ts). */
export function roleHoldsProtected(ctx: ReadCtx, roleId: bigint): boolean {
	for (const c of roleCapabilities(ctx, roleId)) {
		if (isProtected(c)) return true;
	}
	return false;
}

/** Resolve the caller to an active staff member, or null. Never throws. */
export function resolveStaff(ctx: ReadCtx): StaffContext | null {
	const link = ctx.db.auth_provider_link.identity.find(ctx.sender);
	if (link === null) return null;
	const staff = ctx.db.staff_member.person_id.find(link.person_id);
	if (staff === null || !staff.active) return null;
	const role = ctx.db.role.id.find(staff.role_id);
	if (role === null) return null;
	return {
		personId: staff.person_id,
		staffId: staff.id,
		roleId: role.id,
		roleKey: role.key,
		capabilities: roleCapabilities(ctx, role.id),
	};
}

/**
 * Resolve the caller to an active staff member holding `capability`, or throw.
 * Error messages name the capability but never the caller: a rejected call
 * from an unknown identity is not something to describe in detail.
 */
export function requireStaff(ctx: Ctx, capability: Capability): StaffContext {
	const staff = resolveStaff(ctx);
	if (staff === null) {
		throw new SenderError(
			"not authorized: caller is not an active staff member",
		);
	}
	if (!staff.capabilities.has(capability)) {
		throw new SenderError(
			`not authorized: ${capability} requires a different role`,
		);
	}
	return staff;
}

/** Throw unless `staff` may place someone into, or extend, a role holding protected capabilities. */
export function requireSensitiveIfProtected(
	ctx: Ctx,
	staff: StaffContext,
	roleId: bigint,
): void {
	if (
		roleHoldsProtected(ctx, roleId) &&
		!staff.capabilities.has("staff.manage_sensitive")
	) {
		throw new SenderError(
			"not authorized: that role holds protected capabilities",
		);
	}
}

/**
 * True if deactivating or demoting `staffId` would leave nobody active who
 * holds `staff.manage_sensitive`. That person could never be replaced, so
 * the change is refused. This is the last-super-admin guard; it also covers
 * two admins deactivating each other.
 */
export function wouldLockOut(ctx: Ctx, staffId: bigint): boolean {
	const target = ctx.db.staff_member.id.find(staffId);
	if (target === null || !target.active) return false;
	if (!roleCapabilities(ctx, target.role_id).has("staff.manage_sensitive"))
		return false;
	for (const other of ctx.db.staff_member.iter()) {
		if (other.id === staffId || !other.active) continue;
		if (roleCapabilities(ctx, other.role_id).has("staff.manage_sensitive"))
			return false;
	}
	return true;
}

/**
 * Called on every connection. Records one access_event whatever happens.
 * If the caller already has a login, note the visit. If not, and they
 * present a trusted token whose verified email belongs to a person with an
 * active staff row, link this identity to that person. This is how an
 * invitation completes.
 *
 * Besides `init`, this is the only place logins are created. It never
 * rejects: an unknown caller simply stays unknown and every reducer refuses
 * them.
 */
export function noteConnection(ctx: Ctx): void {
	const jwt = ctx.senderAuth.jwt;
	const base = {
		id: 0n,
		at: ctx.timestamp,
		identity: ctx.sender,
		connection_id: ctx.connectionId?.toHexString() ?? "",
		issuer: jwt?.issuer ?? "",
		subject: jwt?.subject ?? "",
		email: "",
	};
	const record = (outcome: AccessOutcome, email = "") => {
		ctx.db.access_event.insert({ ...base, email, outcome });
	};

	const existing = ctx.db.auth_provider_link.identity.find(ctx.sender);
	if (existing !== null) {
		ctx.db.auth_provider_link.id.update({
			...existing,
			last_seen_at: ctx.timestamp,
		});
		record("staff");
		return;
	}

	const verdict = inspectToken(jwt, TRUSTED_ISSUER, TRUSTED_CLIENT_IDS);
	if (verdict.kind === "anonymous") {
		record("anonymous");
		return;
	}
	if (verdict.kind === "untrusted") {
		record("untrusted_token");
		return;
	}

	const person = findInvitedPersonByEmail(ctx, verdict.email);
	if (person === null || jwt === null) {
		record("invited_no_match", verdict.email);
		return;
	}
	ctx.db.auth_provider_link.insert({
		id: 0n,
		identity: ctx.sender,
		issuer: jwt.issuer,
		subject: jwt.subject,
		person_id: person.id,
		created_at: ctx.timestamp,
		last_seen_at: ctx.timestamp,
	});
	record("linked", verdict.email);
}

/** A person with this email who holds an active staff row, or null. */
function findInvitedPersonByEmail(ctx: Ctx, email: string) {
	for (const person of ctx.db.person.email.filter(email)) {
		const staff = ctx.db.staff_member.person_id.find(person.id);
		if (staff?.active) return person;
	}
	return null;
}
