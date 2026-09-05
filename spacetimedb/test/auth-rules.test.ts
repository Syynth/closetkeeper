import type { JwtClaims } from "spacetimedb/server";
import { describe, expect, it } from "vitest";
import {
	can,
	inspectToken,
	isRole,
	looksLikeEmail,
	normalizeEmail,
	ROLES,
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

describe("roles and capabilities", () => {
	it("volunteers can touch inventory and donations but never family data", () => {
		expect(can("volunteer", "inventory.write")).toBe(true);
		expect(can("volunteer", "donation.write")).toBe(true);
		expect(can("volunteer", "family.read")).toBe(false);
		expect(can("volunteer", "family.write")).toBe(false);
		expect(can("volunteer", "staff.manage")).toBe(false);
	});

	it("treasurers are read-only and never see family data", () => {
		expect(can("treasurer", "financial.read")).toBe(true);
		expect(can("treasurer", "inventory.read")).toBe(true);
		expect(can("treasurer", "inventory.write")).toBe(false);
		expect(can("treasurer", "family.read")).toBe(false);
	});

	it("staff can manage staff and family data but not financials", () => {
		expect(can("staff", "family.write")).toBe(true);
		expect(can("staff", "staff.manage")).toBe(true);
		expect(can("staff", "financial.read")).toBe(false);
	});

	it("isRole accepts exactly the closed set", () => {
		for (const r of ROLES) expect(isRole(r)).toBe(true);
		expect(isRole("admin")).toBe(false);
		expect(isRole("")).toBe(false);
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

describe("email helpers", () => {
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
});
