/**
 * Pure authorization rules. No database access, no imports from
 * `spacetimedb/server` at runtime (type-only imports are erased), so these
 * functions run under plain Vitest without a SpacetimeDB host.
 *
 * Anything that touches `ctx.db` lives in auth.ts instead.
 */
import type { JwtClaims } from "spacetimedb/server";

/**
 * Capabilities are the things reducers check. They are a closed set in code
 * because a capability nobody's code checks is meaningless. Roles, which
 * bundle capabilities, are rows (see schema.ts) so the org can shape them
 * without a republish.
 */
export const CAPABILITIES = [
	"inventory.read",
	"inventory.write",
	"inventory.manage",
	"donation.read",
	"donation.write",
	"family.read",
	"family.write",
	"financial.read",
	"staff.manage",
	"staff.manage_sensitive",
	"role.manage",
	"access.read",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * How each capability is shown to people. Plain English, grouped the way a
 * staff member thinks about the closet, not the way the code is organized.
 * Every capability must appear here; a test enforces it.
 */
export const CAPABILITY_INFO: Record<
	Capability,
	{ group: string; label: string }
> = {
	"inventory.read": { group: "Inventory", label: "See the shelves" },
	"inventory.write": { group: "Inventory", label: "Log and adjust inventory" },
	"inventory.manage": {
		group: "Inventory",
		label: "Edit categories, sizes, and conditions",
	},
	"donation.read": { group: "Donations", label: "See donations" },
	"donation.write": { group: "Donations", label: "Log donations" },
	"family.read": { group: "Families", label: "See requests and families" },
	"family.write": { group: "Families", label: "Edit requests and families" },
	"financial.read": { group: "Books", label: "See financial records" },
	"staff.manage": { group: "Access", label: "Manage staff and volunteers" },
	"staff.manage_sensitive": {
		group: "Access",
		label: "Grant protected access",
	},
	"role.manage": { group: "Access", label: "Manage roles" },
	"access.read": { group: "Access", label: "See the access log" },
};

export function isCapability(value: string): value is Capability {
	return (CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Capabilities that encode CLAUDE.md's non-negotiable constraints. Granting
 * one to a role, or putting someone in a role that holds one, requires the
 * caller to hold `staff.manage_sensitive`, which only super-admins have by
 * default. Configurable, but never casually.
 */
export const PROTECTED_CAPABILITIES: readonly Capability[] = [
	"family.read",
	"family.write",
	"role.manage",
	"staff.manage_sensitive",
	// The access log carries emails of people who are not staff.
	"access.read",
];

export function isProtected(capability: Capability): boolean {
	return PROTECTED_CAPABILITIES.includes(capability);
}

/** Roles seeded by init. System roles cannot be deleted. */
export interface SystemRole {
	key: string;
	label: string;
	description: string;
	capabilities: readonly Capability[];
}

const ALL: readonly Capability[] = CAPABILITIES;
const OPERATIONS: readonly Capability[] = [
	"inventory.read",
	"inventory.write",
	"donation.read",
	"donation.write",
];
const FAMILY: readonly Capability[] = ["family.read", "family.write"];
/** Reshaping the vocabularies is staff work, not a volunteer's. */
const VOCABULARY: readonly Capability[] = ["inventory.manage"];

export const SYSTEM_ROLES: readonly SystemRole[] = [
	{
		key: "system_admin",
		label: "System administrator",
		description:
			"Technical role for bootstrap and recovery. Holds every capability.",
		capabilities: ALL,
	},
	{
		key: "president",
		label: "President",
		description:
			"The organization's top officer. Same access as staff; system access stays with the system administrator.",
		capabilities: [...OPERATIONS, ...VOCABULARY, ...FAMILY, "staff.manage"],
	},
	{
		key: "staff",
		label: "Staff",
		description:
			"General staff: inventory, donations, families, and staff management.",
		capabilities: [...OPERATIONS, ...VOCABULARY, ...FAMILY, "staff.manage"],
	},
	{
		key: "secretary",
		label: "Secretary",
		description:
			"Records and appointments: inventory, donations, families, and staff management.",
		capabilities: [...OPERATIONS, ...VOCABULARY, ...FAMILY, "staff.manage"],
	},
	{
		key: "treasurer",
		label: "Treasurer",
		description:
			"The only role with financial records. Also inventory, donations, and families.",
		capabilities: [...OPERATIONS, ...FAMILY, "financial.read"],
	},
	{
		key: "volunteer",
		label: "Volunteer",
		description: "Inventory and donation intake. Never family data.",
		capabilities: OPERATIONS,
	},
];

/** The role the publisher and the bootstrap email receive. */
export const BOOTSTRAP_ROLE_KEY = "system_admin";

/** How a login row is described to its owner, from the token issuer that created it. */
export function describeLogin(issuer: string, trustedIssuer: string): string {
	if (issuer === "") return "Publisher key";
	if (issuer === trustedIssuer) return "Sign-in link";
	try {
		return new URL(issuer).host;
	} catch {
		return issuer;
	}
}

/** Role keys are stable machine names: lowercase, digits, underscores. */
export function isValidRoleKey(key: string): boolean {
	return /^[a-z][a-z0-9_]{1,39}$/.test(key);
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

/** What a connection turned out to be. Stored in access_event.outcome. */
export const ACCESS_OUTCOMES = [
	"staff", // already linked to an active staff member
	"linked", // trusted token matched an invitation; link created on this connection
	"invited_no_match", // trusted token, but no active staff invitation for that email
	"untrusted_token", // a JWT we do not accept (issuer, audience, or unverified email)
	"anonymous", // no token at all
] as const;
export type AccessOutcome = (typeof ACCESS_OUTCOMES)[number];

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

/**
 * Build the JSON `details` string for an audit event from reducer
 * arguments, dropping redacted (personal) fields. bigint becomes a decimal
 * string so it survives JSON.
 */
export function auditDetails(
	args: Record<string, unknown>,
	redact: readonly string[] = [],
	extra: Record<string, unknown> = {},
): string {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(args)) {
		if (redact.includes(k)) continue;
		out[k] = v;
	}
	Object.assign(out, extra);
	return JSON.stringify(out, (_k, v) =>
		typeof v === "bigint" ? v.toString() : v,
	);
}
