/**
 * Authorization against a real local instance.
 *
 * The CLI's logged-in identity publishes the module, so `init` seeds it as
 * the first system administrator. Calls made without `--anonymous` are therefore
 * "the publisher"; calls made with it are "a stranger".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, call, publish, sql } from "./harness";

const DATABASE = "closetkeeper-test-auth";

type StaffRow = [
	id: number,
	person_id: number,
	role_key: string,
	active: boolean,
];

function staffRows(): StaffRow[] {
	return sql<StaffRow>(
		DATABASE,
		"SELECT s.id, s.person_id, r.key, s.active FROM staff_member s JOIN role r ON s.role_id = r.id",
	);
}
function roleId(key: string): number {
	const row = sql<[number]>(
		DATABASE,
		`SELECT id FROM role WHERE key = '${key}'`,
	)[0];
	if (!row) throw new Error(`role ${key} missing`);
	return row[0];
}
function capsOf(key: string): string[] {
	return sql<[string]>(
		DATABASE,
		`SELECT rc.capability FROM role_capability rc JOIN role r ON rc.role_id = r.id WHERE r.key = '${key}'`,
	)
		.map((r) => r[0])
		.sort();
}
function staffIdByRole(key: string): number {
	const row = staffRows().find((r) => r[2] === key);
	if (!row) throw new Error(`no staff member with role ${key}`);
	return row[0];
}
function auditActions(): string[] {
	return sql<[string]>(DATABASE, "SELECT action FROM audit_event").map(
		(r) => r[0],
	);
}

describe("bootstrap", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
	});

	it("seeds the system roles", () => {
		const keys = sql<[string]>(DATABASE, "SELECT key FROM role")
			.map((r) => r[0])
			.sort();
		expect(keys).toEqual([
			"president",
			"secretary",
			"staff",
			"system_admin",
			"treasurer",
			"volunteer",
		]);
		expect(capsOf("volunteer")).not.toContain("family.read");
		expect(capsOf("system_admin")).toContain("staff.manage_sensitive");
	});

	it("seeds exactly one staff member: the publisher, as system_admin", () => {
		const rows = staffRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.[2]).toBe("system_admin");
		expect(rows[0]?.[3]).toBe(true);
	});

	it("wrote an init audit event with no actor", () => {
		const rows = sql<[string, number]>(
			DATABASE,
			"SELECT action, actor_staff_id FROM audit_event",
		);
		expect(rows).toEqual([["init", 0]]);
	});

	it("scheduled the access-event purge", () => {
		expect(
			sql(DATABASE, "SELECT scheduled_id FROM access_event_purge_schedule"),
		).toHaveLength(1);
	});
});

describe("invite_staff", () => {
	it("refuses a stranger and leaves no audit row", () => {
		const err = call(
			DATABASE,
			"invite_staff",
			["v@example.org", "V", "volunteer"],
			{
				anonymous: true,
			},
		);
		expect(err).toContain("not authorized");
		expect(staffRows()).toHaveLength(1);
		expect(auditActions()).not.toContain("invite_staff");
	});

	it("lets the publisher invite a volunteer, idempotently, and audits it without the email", () => {
		expect(
			call(DATABASE, "invite_staff", ["V@Example.org ", "Val", "volunteer"]),
		).toBeNull();
		expect(
			call(DATABASE, "invite_staff", ["v@example.org", "Val", "volunteer"]),
		).toBeNull();
		expect(
			staffRows()
				.map((r) => r[2])
				.sort(),
		).toEqual(["system_admin", "volunteer"]);
		expect(
			sql(DATABASE, "SELECT id FROM person WHERE email = 'v@example.org'"),
		).toHaveLength(1);

		const events = sql<[string, string, number]>(
			DATABASE,
			"SELECT action, details, target_id FROM audit_event WHERE action = 'invite_staff'",
		);
		expect(events).toHaveLength(2);
		for (const [, details] of events) {
			expect(details).not.toContain("@");
			expect(details).not.toContain("Val");
			expect(JSON.parse(details)).toHaveProperty("role_key", "volunteer");
		}
	});

	it("rejects an unknown role and a malformed email", () => {
		expect(
			call(DATABASE, "invite_staff", ["x@example.org", "X", "admin"]),
		).toContain("unknown role");
		expect(
			call(DATABASE, "invite_staff", ["not-an-email", "X", "staff"]),
		).toContain("invalid email");
	});

	it("refuses to change an existing staff member's role by re-inviting", () => {
		expect(
			call(DATABASE, "invite_staff", ["v@example.org", "Val", "staff"]),
		).toContain("already a staff member");
	});

	it("lets a system administrator invite into a protected role (staff sees family data)", () => {
		expect(
			call(DATABASE, "invite_staff", ["s@example.org", "Sam", "staff"]),
		).toBeNull();
		expect(
			staffRows()
				.map((r) => r[2])
				.sort(),
		).toEqual(["staff", "system_admin", "volunteer"]);
	});
});

describe("set_staff_active / set_staff_role", () => {
	it("refuses a stranger", () => {
		const err = call(
			DATABASE,
			"set_staff_active",
			[staffIdByRole("volunteer"), false],
			{
				anonymous: true,
			},
		);
		expect(err).toContain("not authorized");
	});

	it("will not let the last system administrator deactivate or demote themselves", () => {
		const me = staffIdByRole("system_admin");
		expect(call(DATABASE, "set_staff_active", [me, false])).toContain(
			"nobody else",
		);
		expect(call(DATABASE, "set_staff_role", [me, "volunteer"])).toContain(
			"nobody else",
		);
		expect(staffRows().find((r) => r[0] === me)?.[3]).toBe(true);
	});

	it("deactivates and reactivates someone else, and audits both", () => {
		const id = staffIdByRole("volunteer");
		expect(call(DATABASE, "set_staff_active", [id, false])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[3]).toBe(false);
		expect(call(DATABASE, "set_staff_active", [id, true])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[3]).toBe(true);
		expect(auditActions().filter((a) => a === "set_staff_active")).toHaveLength(
			2,
		);
	});

	it("changes someone else's role", () => {
		const id = staffIdByRole("volunteer");
		expect(call(DATABASE, "set_staff_role", [id, "treasurer"])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[2]).toBe("treasurer");
		expect(call(DATABASE, "set_staff_role", [id, "volunteer"])).toBeNull();
	});
});

describe("roles", () => {
	it("creates a custom role, grants and revokes, and deletes it", () => {
		expect(
			call(DATABASE, "create_role", [
				"intake_volunteer",
				"Intake volunteer",
				"Bags only",
			]),
		).toBeNull();
		const id = roleId("intake_volunteer");
		expect(
			call(DATABASE, "grant_capability", [id, "inventory.write"]),
		).toBeNull();
		expect(
			call(DATABASE, "grant_capability", [id, "inventory.write"]),
		).toBeNull(); // idempotent
		expect(capsOf("intake_volunteer")).toEqual(["inventory.write"]);
		expect(
			call(DATABASE, "revoke_capability", [id, "inventory.write"]),
		).toBeNull();
		expect(capsOf("intake_volunteer")).toEqual([]);
		expect(call(DATABASE, "delete_role", [id])).toBeNull();
		expect(
			sql(DATABASE, "SELECT id FROM role WHERE key = 'intake_volunteer'"),
		).toHaveLength(0);
	});

	it("rejects bad keys, duplicates, and unknown capabilities", () => {
		expect(call(DATABASE, "create_role", ["Bad Key", "x", ""])).toContain(
			"invalid role key",
		);
		expect(call(DATABASE, "create_role", ["volunteer", "x", ""])).toContain(
			"already exists",
		);
		expect(
			call(DATABASE, "grant_capability", [roleId("volunteer"), "root"]),
		).toContain("unknown capability");
	});

	it("refuses to delete a system role or a role in use", () => {
		expect(call(DATABASE, "delete_role", [roleId("treasurer")])).toContain(
			"system roles",
		);
		expect(call(DATABASE, "delete_role", [roleId("volunteer")])).toContain(
			"system roles",
		);
	});

	it("never strips system_admin", () => {
		expect(
			call(DATABASE, "revoke_capability", [
				roleId("system_admin"),
				"role.manage",
			]),
		).toContain("keeps every capability");
		expect(capsOf("system_admin")).toContain("role.manage");
	});

	it("records a protected grant as such in the audit log", () => {
		expect(
			call(DATABASE, "create_role", ["reviewer", "Reviewer", ""]),
		).toBeNull();
		const id = roleId("reviewer");
		expect(call(DATABASE, "grant_capability", [id, "family.read"])).toBeNull();
		const rows = sql<[string]>(
			DATABASE,
			`SELECT details FROM audit_event WHERE action = 'grant_capability' AND target_id = ${id}`,
		);
		expect(rows.length).toBeGreaterThan(0);
		expect(JSON.parse(rows[rows.length - 1]?.[0] ?? "{}")).toMatchObject({
			capability: "family.read",
			protected: true,
		});
	});
});

describe("audit log hygiene", () => {
	it("contains no email addresses anywhere in details", () => {
		for (const [details] of sql<[string]>(
			DATABASE,
			"SELECT details FROM audit_event",
		)) {
			expect(details).not.toMatch(/@/);
		}
	});
});
