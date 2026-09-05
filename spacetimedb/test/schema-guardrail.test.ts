/**
 * Schema guardrail.
 *
 * CLAUDE.md non-negotiable #1: tables containing person records, requests, or
 * appointments are never public. This test turns that sentence into a CI
 * failure. Every table in the published schema must be private unless it is
 * listed here explicitly, with a reason.
 *
 * Adding a table to PUBLIC_TABLES is a deliberate act that should show up in
 * review as a diff to this file, not as a flag buried in the schema.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, describeTables, publish } from "./harness";

const DATABASE = "closetkeeper-test-guardrail";

/**
 * Tables that are allowed to be public, and why. Vocabulary tables (sizes,
 * categories) are candidates once they exist: they contain no family data and
 * the phase-2 public site may read them. Nothing else belongs here.
 */
const PUBLIC_TABLES: ReadonlyMap<string, string> = new Map([
	// ["size", "closed vocabulary, no family data, read by the public donation-needs page"],
]);

/** Table names that must never be public regardless of what the allowlist says. */
const NEVER_PUBLIC = [
	"person",
	"auth_provider_link",
	"staff_member",
	"request",
	"appointment",
	"donation",
];

describe("schema guardrail", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
	});

	it("publishes and describes the module", () => {
		const tables = describeTables(DATABASE);
		expect(Array.isArray(tables)).toBe(true);
	});

	it("keeps every table private unless explicitly allowlisted", () => {
		const offenders = describeTables(DATABASE)
			.filter((t) => t.access === "Public")
			.filter((t) => !PUBLIC_TABLES.has(t.name))
			.map((t) => t.name);

		expect(
			offenders,
			`Public tables not on the allowlist: ${offenders.join(", ")}. ` +
				"Either make them private, or add them to PUBLIC_TABLES with a reason.",
		).toEqual([]);
	});

	it("never allowlists a family-data table", () => {
		const wrongfullyAllowlisted = NEVER_PUBLIC.filter((name) =>
			PUBLIC_TABLES.has(name),
		);
		expect(wrongfullyAllowlisted).toEqual([]);
	});

	it("does not leave allowlist entries for tables that no longer exist", () => {
		const existing = new Set(describeTables(DATABASE).map((t) => t.name));
		const stale = [...PUBLIC_TABLES.keys()].filter(
			(name) => !existing.has(name),
		);
		expect(stale).toEqual([]);
	});
});
