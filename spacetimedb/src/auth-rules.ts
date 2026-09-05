/**
 * Pure authorization rules. No database access, no imports from
 * `spacetimedb/server` at runtime (type-only imports are erased), so these
 * functions run under plain Vitest without a SpacetimeDB host.
 *
 * Anything that touches `ctx.db` lives in auth.ts instead.
 */
import type { JwtClaims } from "spacetimedb/server";

/**
 * Roles are a closed set defined in code, not a vocabulary table, because
 * each role's meaning is enforced by code paths. Adding a role is a code
 * change regardless, so a table would only add a place for the two to drift.
 * See CLAUDE.md, "Roles".
 */
export const ROLES = ["volunteer", "staff", "treasurer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
	return (ROLES as readonly string[]).includes(value);
}

/**
 * What each role may do. Keep this table the single source of truth; reducers
 * ask `can(role, capability)` rather than comparing role names.
 */
export const CAPABILITIES = [
	"inventory.read",
	"inventory.write",
	"donation.read",
	"donation.write",
	"family.read",
	"family.write",
	"financial.read",
	"staff.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const GRANTS: Record<Role, readonly Capability[]> = {
	volunteer: [
		"inventory.read",
		"inventory.write",
		"donation.read",
		"donation.write",
	],
	staff: [
		"inventory.read",
		"inventory.write",
		"donation.read",
		"donation.write",
		"family.read",
		"family.write",
		"staff.manage",
	],
	treasurer: ["inventory.read", "donation.read", "financial.read"],
};

export function can(role: Role, capability: Capability): boolean {
	return GRANTS[role].includes(capability);
}

/** Result of inspecting a caller's token. */
export type TokenVerdict =
	| { kind: "anonymous" }
	| { kind: "untrusted"; reason: string }
	| { kind: "trusted"; email: string };

/**
 * Decide whether a JWT may be used to link a browser login to a staff
 * account. Requires our issuer, one of our client IDs in the audience, and a
 * verified email, because the invitation model matches on email.
 */
export function inspectToken(
	jwt: JwtClaims | null,
	trustedIssuer: string,
	trustedClientIds: readonly string[],
): TokenVerdict {
	if (jwt === null) return { kind: "anonymous" };
	if (jwt.issuer !== trustedIssuer) {
		return { kind: "untrusted", reason: "issuer" };
	}
	if (!jwt.audience.some((aud) => trustedClientIds.includes(aud))) {
		return { kind: "untrusted", reason: "audience" };
	}
	const payload = jwt.fullPayload;
	const email = payload.email;
	if (typeof email !== "string" || email.length === 0) {
		return { kind: "untrusted", reason: "no email claim" };
	}
	if (payload.email_verified !== true) {
		return { kind: "untrusted", reason: "email not verified" };
	}
	return { kind: "trusted", email: normalizeEmail(email) };
}

/** Emails are matched case-insensitively and without surrounding whitespace. */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** Minimal shape check; the real validation is that a magic link arrives. */
export function looksLikeEmail(email: string): boolean {
	const e = normalizeEmail(email);
	const at = e.indexOf("@");
	return at > 0 && at < e.length - 1 && !e.includes(" ");
}
