/**
 * The views and reducers behind the admin screens, against a real local
 * instance. Views are SQL-queryable through the CLI and are evaluated as the
 * caller, so `--anonymous` proves the gating and the default identity (the
 * publisher, a system administrator) proves the content.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, call, publish, sql, sqlAs } from "./harness";

const DATABASE = "closetkeeper-test-admin-views";

describe("admin views", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
		expect(
			call(DATABASE, "invite_staff", ["val@example.org", "Val", "volunteer"]),
		).toBeNull();
	});

	it("staff_directory reports who has signed in and when", () => {
		// The CLI serializes a timestamp as a one-element array of micros.
		const rows = sql<[string, boolean, [number]]>(
			DATABASE,
			"SELECT display_name, has_signed_in, last_seen_at FROM staff_directory",
		);
		const byName = new Map(rows.map((r) => [r[0], r]));
		expect(byName.get("Publisher")?.[1]).toBe(true);
		expect(byName.get("Publisher")?.[2]?.[0]).toBeGreaterThan(0);
		expect(byName.get("Val")?.[1]).toBe(false);
		expect(byName.get("Val")?.[2]?.[0]).toBe(0);
	});

	it("role_options counts active holders", () => {
		const rows = sql<[string, number]>(
			DATABASE,
			"SELECT key, holders FROM role_options",
		);
		const byKey = new Map(rows);
		expect(byKey.get("system_admin")).toBe(1);
		expect(byKey.get("volunteer")).toBe(1);
		expect(byKey.get("president")).toBe(0);
	});

	it("role_capability_matrix covers every role × capability with labels", () => {
		const roles = sql<[number]>(DATABASE, "SELECT id FROM role").length;
		const cells = sql<[string, string, string, boolean, boolean]>(
			DATABASE,
			"SELECT capability, group, label, protected, granted FROM role_capability_matrix",
		);
		expect(cells.length % roles).toBe(0);
		expect(cells.length / roles).toBeGreaterThanOrEqual(11);
		for (const [, group, label] of cells) {
			expect(group.length).toBeGreaterThan(0);
			expect(label.length).toBeGreaterThan(0);
		}
		const familyRead = cells.filter((c) => c[0] === "family.read");
		expect(familyRead.every((c) => c[3])).toBe(true);
	});

	it("my_account, my_logins, and my_recent_sign_ins describe the caller only", () => {
		const me = sql<[string, string]>(
			DATABASE,
			"SELECT display_name, role_key FROM my_account",
		);
		expect(me).toEqual([["Publisher", "system_admin"]]);
		const logins = sql<[string, boolean]>(
			DATABASE,
			"SELECT label, current FROM my_logins",
		);
		expect(logins).toHaveLength(1);
		expect(logins[0]?.[0]).toBe("Publisher key");
		expect(logins[0]?.[1]).toBe(true);
		const signIns = sql<[string]>(
			DATABASE,
			"SELECT outcome FROM my_recent_sign_ins",
		);
		expect(signIns.length).toBeGreaterThan(0);
		expect(signIns.every((r) => r[0] === "staff")).toBe(true);
	});

	it("access_log is visible to the system administrator and empty for a stranger", () => {
		const mine = sql<[string, string]>(
			DATABASE,
			"SELECT outcome, display_name FROM access_log",
		);
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.some((r) => r[1] === "Publisher")).toBe(true);
		expect(
			sqlAs(DATABASE, "SELECT event_id FROM access_log", { anonymous: true }),
		).toEqual([]);
		expect(
			sqlAs(DATABASE, "SELECT staff_id FROM staff_directory", {
				anonymous: true,
			}),
		).toEqual([]);
		expect(
			sqlAs(DATABASE, "SELECT person_id FROM my_account", { anonymous: true }),
		).toEqual([]);
	});
});

describe("account and person reducers", () => {
	function staffIdOf(name: string): number {
		const row = sql<[number, string]>(
			DATABASE,
			"SELECT staff_id, display_name FROM staff_directory",
		).find((r) => r[1] === name);
		if (!row) throw new Error(`${name} missing`);
		return row[0];
	}

	it("set_staff_person changes name and email, and refuses a taken email", () => {
		const id = staffIdOf("Val");
		expect(
			call(DATABASE, "set_staff_person", [
				id,
				"Valerie",
				"Valerie@Example.org",
			]),
		).toBeNull();
		const rows = sql<[string, string]>(
			DATABASE,
			`SELECT display_name, email FROM staff_directory WHERE staff_id = ${id}`,
		);
		expect(rows).toEqual([["Valerie", "valerie@example.org"]]);
		expect(
			call(DATABASE, "invite_staff", ["taken@example.org", "T", "volunteer"]),
		).toBeNull();
		expect(
			call(DATABASE, "set_staff_person", [id, "Valerie", "taken@example.org"]),
		).toContain("another person");
		expect(
			call(DATABASE, "set_staff_person", [id, "", "valerie@example.org"]),
		).toContain("required");
	});

	it("update_my_name renames the caller and audits without the name", () => {
		expect(call(DATABASE, "update_my_name", ["Ben"])).toBeNull();
		expect(
			sql<[string]>(DATABASE, "SELECT display_name FROM my_account"),
		).toEqual([["Ben"]]);
		const details = sql<[string]>(
			DATABASE,
			"SELECT details FROM audit_event WHERE action = 'update_my_name'",
		);
		expect(details.length).toBe(1);
		expect(details[0]?.[0]).not.toContain("Ben");
		expect(
			call(DATABASE, "update_my_name", ["X"], { anonymous: true }),
		).toContain("not authorized");
	});

	it("remove_my_login refuses the current and the last login", () => {
		const links = sql<[number]>(DATABASE, "SELECT link_id FROM my_logins");
		const id = links[0]?.[0];
		expect(id).toBeDefined();
		const err = call(DATABASE, "remove_my_login", [id]);
		expect(err).toMatch(/using now|only login/);
	});
});

describe("first-visit welcome", () => {
	it("the publisher is welcomed by init; an invitee is not until finish_welcome", () => {
		const me = sql<[boolean, string]>(
			DATABASE,
			"SELECT welcomed, display_name FROM my_staff",
		);
		expect(me[0]?.[0]).toBe(true);
		// Invitees start un-welcomed: the seeded publisher is the only welcomed row.
		// Timestamps come back as a one-element product: [micros].
		const stamps = sql<[number, [number]]>(
			DATABASE,
			"SELECT id, welcomed_at FROM staff_member",
		);
		expect(stamps.length).toBeGreaterThan(1);
		expect(stamps.filter(([, [micros]]) => micros > 0)).toHaveLength(1);
		expect(call(DATABASE, "finish_welcome", ["Ben C."])).toBeNull();
		expect(
			sql<[string, boolean]>(
				DATABASE,
				"SELECT display_name, welcomed FROM my_staff",
			),
		).toEqual([["Ben C.", true]]);
		expect(call(DATABASE, "finish_welcome", [""])).toContain("required");
		expect(
			call(DATABASE, "finish_welcome", ["X"], { anonymous: true }),
		).toContain("not authorized");
	});

	it("my_staff carries plain-English capability labels", () => {
		const rows = sql<[string[], string[]]>(
			DATABASE,
			"SELECT capabilities, capability_labels FROM my_staff",
		);
		const [caps, labels] = rows[0] ?? [[], []];
		expect(labels.length).toBe(caps.length);
		expect(labels).toContain("See the shelves");
	});
});
