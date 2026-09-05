/**
 * Authorization against the database. Every admin reducer starts with
 * `requireStaff(ctx, capability)`; there is no other path to "is this caller
 * ours". Connecting grants nothing (see clientConnected in index.ts).
 */
import {
	type InferSchema,
	type ReducerCtx,
	SenderError,
} from "spacetimedb/server";
import {
	type Capability,
	can,
	inspectToken,
	isRole,
	type Role,
} from "./auth-rules";
import { TRUSTED_CLIENT_IDS, TRUSTED_ISSUER } from "./config";
import type spacetimedb from "./schema";

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export interface StaffContext {
	personId: bigint;
	staffId: bigint;
	role: Role;
}

/** Resolve the caller to an active staff member, or null. Never throws. */
export function resolveStaff(ctx: Ctx): StaffContext | null {
	const link = ctx.db.auth_provider_link.identity.find(ctx.sender);
	if (link === null) return null;
	const staff = ctx.db.staff_member.person_id.find(link.person_id);
	if (staff === null || !staff.active) return null;
	if (!isRole(staff.role)) return null;
	return { personId: staff.person_id, staffId: staff.id, role: staff.role };
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
	if (!can(staff.role, capability)) {
		throw new SenderError(
			`not authorized: ${capability} requires a different role`,
		);
	}
	return staff;
}

/**
 * Called on every connection. If the caller already has a login, note the
 * visit. If not, and they present a trusted token whose verified email
 * belongs to a person with an active staff row, link this identity to that
 * person. This is how an invitation completes.
 *
 * Besides `init`, this is the only place logins are created. It never
 * rejects: an unknown caller simply stays unknown and every reducer refuses
 * them.
 */
export function noteConnection(ctx: Ctx): void {
	const existing = ctx.db.auth_provider_link.identity.find(ctx.sender);
	if (existing !== null) {
		ctx.db.auth_provider_link.id.update({
			...existing,
			last_seen_at: ctx.timestamp,
		});
		return;
	}

	const verdict = inspectToken(
		ctx.senderAuth.jwt,
		TRUSTED_ISSUER,
		TRUSTED_CLIENT_IDS,
	);
	if (verdict.kind !== "trusted") return;

	const person = findInvitedPersonByEmail(ctx, verdict.email);
	if (person === null) return;

	const jwt = ctx.senderAuth.jwt;
	if (jwt === null) return; // unreachable after a trusted verdict; keeps the type narrow
	ctx.db.auth_provider_link.insert({
		id: 0n,
		identity: ctx.sender,
		issuer: jwt.issuer,
		subject: jwt.subject,
		person_id: person.id,
		created_at: ctx.timestamp,
		last_seen_at: ctx.timestamp,
	});
}

/** A person with this email who holds an active staff row, or null. */
function findInvitedPersonByEmail(ctx: Ctx, email: string) {
	for (const person of ctx.db.person.email.filter(email)) {
		const staff = ctx.db.staff_member.person_id.find(person.id);
		if (staff?.active) return person;
	}
	return null;
}
