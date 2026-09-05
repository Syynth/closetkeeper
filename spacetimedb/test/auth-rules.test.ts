import type { JwtClaims } from "spacetimedb/server";
import { describe, expect, it } from "vitest";
import {
	auditDetails,
	BOOTSTRAP_ROLE_KEY,
	CAPABILITIES,
	inspectToken,
	isCapability,
	isProtected,
	isValidRoleKey,
	looksLikeEmail,
	normalizeEmail,
	PROTECTED_CAPABILITIES,
	SYSTEM_ROLES,
} from "../src/auth-rules";

const ISSUER = "https://auth.spacetimedb.com/oidc";
const CLIENT = "client-abc";

function claims(
	overrides: Partial<JwtClaims> & { payload?: Record<string, unknown> },
): JwtClaims {
	const fullPayload = {
		email: "Staff@Example.org",
		email_verified: true,
		...(overrides.payload ?? {}),
	};
	return {
		rawPayload: JSON.stringify(fullPayload),
		subject: "sub-1",
		issuer: ISSUER,
		audience: [CLIENT],
		identity: undefined as never, // not consulted by the rules
		fullPayload,
		...overrides,
	} as JwtClaims;
}

describe("capabilities", () => {
	it("isCapability accepts exactly the closed set", () => {
		for (const c of CAPABILITIES) expect(isCapability(c)).toBe(true);
		expect(isCapability("admin")).toBe(false);
		expect(isCapability("")).toBe(false);
	});

	it("family data and access management are protected", () => {
		expect(isProtected("family.read")).toBe(true);
		expect(isProtected("family.write")).toBe(true);
		expect(isProtected("role.manage")).toBe(true);
		expect(isProtected("staff.manage_sensitive")).toBe(true);
		expect(isProtected("inventory.write")).toBe(false);
		for (const p of PROTECTED_CAPABILITIES) expect(isCapability(p)).toBe(true);
	});
});

describe("system roles", () => {
	const byKey = new Map(SYSTEM_ROLES.map((r) => [r.key, r]));

	it("have valid keys and only real capabilities", () => {
		for (const r of SYSTEM_ROLES) {
			expect(isValidRoleKey(r.key), r.key).toBe(true);
			for (const c of r.capabilities)
				expect(isCapability(c), `${r.key}: ${c}`).toBe(true);
		}
	});

	it("seed the org's roles plus the technical system_admin", () => {
		expect([...byKey.keys()].sort()).toEqual(
			[
				"president",
				"secretary",
				"staff",
				"system_admin",
				"treasurer",
				"volunteer",
			].sort(),
		);
		expect(byKey.has(BOOTSTRAP_ROLE_KEY)).toBe(true);
	});

	it("give system_admin every capability", () => {
		expect([...(byKey.get("system_admin")?.capabilities ?? [])].sort()).toEqual(
			[...CAPABILITIES].sort(),
		);
	});

	it("never give volunteers family data (CLAUDE.md constraint 2)", () => {
		const v = byKey.get("volunteer")?.capabilities ?? [];
		expect(v).not.toContain("family.read");
		expect(v).not.toContain("family.write");
		expect(v).toContain("inventory.write");
		expect(v).toContain("donation.write");
	});

	it("give every non-volunteer role family data, and only treasurer (and the system admin) financials", () => {
		for (const key of ["president", "secretary", "staff", "treasurer"]) {
			expect(byKey.get(key)?.capabilities, key).toContain("family.read");
		}
		for (const r of SYSTEM_ROLES) {
			const hasFinancial = r.capabilities.includes("financial.read");
			const allowed = r.key === "treasurer" || r.key === "system_admin";
			expect(hasFinancial, r.key).toBe(allowed);
		}
	});
});

describe("inspectToken", () => {
	it("treats no token as anonymous", () => {
		expect(inspectToken(null, ISSUER, [CLIENT])).toEqual({ kind: "anonymous" });
	});

	it("accepts our issuer, our audience, and a verified email, normalized", () => {
		expect(inspectToken(claims({}), ISSUER, [CLIENT])).toEqual({
			kind: "trusted",
			email: "staff@example.org",
		});
	});

	it("rejects a token from another issuer", () => {
		const v = inspectToken(
			claims({ issuer: "https://accounts.google.com" }),
			ISSUER,
			[CLIENT],
		);
		expect(v).toEqual({ kind: "untrusted", reason: "issuer" });
	});

	it("rejects a token minted for a different application", () => {
		const v = inspectToken(
			claims({ audience: ["someone-elses-app"] }),
			ISSUER,
			[CLIENT],
		);
		expect(v).toEqual({ kind: "untrusted", reason: "audience" });
	});

	it("rejects every token while no client IDs are configured", () => {
		expect(inspectToken(claims({}), ISSUER, []).kind).toBe("untrusted");
	});

	it("rejects an unverified or missing email", () => {
		expect(
			inspectToken(claims({ payload: { email_verified: false } }), ISSUER, [
				CLIENT,
			]),
		).toEqual({ kind: "untrusted", reason: "email not verified" });
		expect(
			inspectToken(claims({ payload: { email: "" } }), ISSUER, [CLIENT]),
		).toEqual({
			kind: "untrusted",
			reason: "no email claim",
		});
	});
});

describe("email and key helpers", () => {
	it("normalizes case and whitespace", () => {
		expect(normalizeEmail("  Someone@Example.ORG ")).toBe(
			"someone@example.org",
		);
	});

	it("looksLikeEmail is a shape check only", () => {
		expect(looksLikeEmail("a@b")).toBe(true);
		expect(looksLikeEmail("no-at-sign")).toBe(false);
		expect(looksLikeEmail("@b")).toBe(false);
		expect(looksLikeEmail("a@")).toBe(false);
		expect(looksLikeEmail("a b@c")).toBe(false);
	});

	it("role keys are stable machine names", () => {
		expect(isValidRoleKey("intake_volunteer")).toBe(true);
		expect(isValidRoleKey("Intake Volunteer")).toBe(false);
		expect(isValidRoleKey("1st")).toBe(false);
		expect(isValidRoleKey("a")).toBe(false);
	});
});

describe("auditDetails", () => {
	it("drops redacted fields and stringifies bigints", () => {
		const s = auditDetails(
			{ email: "x@y.z", display_name: "X", role_key: "staff", staff_id: 42n },
			["email", "display_name"],
			{ person_id: 7n },
		);
		expect(JSON.parse(s)).toEqual({
			role_key: "staff",
			staff_id: "42",
			person_id: "7",
		});
		expect(s).not.toContain("@");
	});
});
