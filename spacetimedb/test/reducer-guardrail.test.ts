/**
 * Reducer guardrail.
 *
 * Every client-callable reducer must be declared through defineAdminReducer,
 * which applies the staff allowlist and writes the audit log. This test
 * turns "we cannot forget to audit" into a CI failure: it lists the
 * published database's reducers and checks each against the names declared
 * in source through the helper, plus a short explicit allowlist.
 *
 * The registry is read from source rather than imported: the module's files
 * import `spacetimedb/server`, which needs the host runtime.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, describeReducers, publish } from "./harness";

/**
 * `describe` reports a reducer's source identifier (`inviteStaff`); the
 * database name, the helper's declared name, and the CLI all use snake_case
 * (`invite_staff`). Compare in snake_case.
 */
function toSnake(name: string): string {
	return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "");
}

const DATABASE = "closetkeeper-test-reducers";
const SRC = resolve(import.meta.dirname, "../src");

/**
 * Client-callable reducers that legitimately bypass defineAdminReducer,
 * with the reason. Keep this list short and every entry justified.
 */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
	[
		"purge_access_events",
		"scheduled by the database itself; refuses any other caller",
	],
]);

/** Names declared as `name: "..."` inside defineAdminReducer({ ... }) blocks. */
function declaredAdminReducers(): Set<string> {
	const names = new Set<string>();
	for (const file of readdirSync(SRC)) {
		if (!file.endsWith(".ts")) continue;
		const text = readFileSync(join(SRC, file), "utf8");
		for (const m of text.matchAll(
			/defineAdminReducer\(\s*\{[^}]*?name:\s*"([a-z0-9_]+)"/gs,
		)) {
			const name = m[1];
			if (name) names.add(name);
		}
	}
	return names;
}

describe("reducer guardrail", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
	});

	it("every client-callable reducer is an admin reducer or explicitly allowlisted", () => {
		const declared = declaredAdminReducers();
		const offenders = describeReducers(DATABASE)
			.filter((r) => r.clientCallable)
			.map((r) => toSnake(r.name))
			.filter((name) => !declared.has(name) && !ALLOWLIST.has(name));
		expect(
			offenders,
			`Reducers declared without defineAdminReducer: ${offenders.join(", ")}. ` +
				"Use the helper, or add them to ALLOWLIST with a reason.",
		).toEqual([]);
	});

	it("does not keep allowlist entries for reducers that no longer exist", () => {
		const existing = new Set(
			describeReducers(DATABASE).map((r) => toSnake(r.name)),
		);
		const stale = [...ALLOWLIST.keys()].filter((n) => !existing.has(n));
		expect(stale).toEqual([]);
	});

	it("declares at least the staff-management reducers through the helper", () => {
		const declared = declaredAdminReducers();
		for (const n of [
			"invite_staff",
			"set_staff_active",
			"set_staff_role",
			"grant_capability",
		]) {
			expect(declared.has(n), n).toBe(true);
		}
	});
});
