/**
 * Authorization against a real local instance.
 *
 * The CLI's logged-in identity publishes the module, so `init` seeds it as
 * the first staff member. Calls made without `--anonymous` are therefore
 * "the publisher"; calls made with it are "a stranger".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, call, publish, sql } from "./harness";

const DATABASE = "closetkeeper-test-auth";

type StaffRow = [id: number, person_id: number, role: string, active: boolean];

function staffRows(): StaffRow[] {
	return sql<StaffRow>(
		DATABASE,
		"SELECT id, person_id, role, active FROM staff_member",
	);
}

describe("bootstrap", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
	});

	it("seeds exactly one staff member: the publisher, as staff", () => {
		const rows = staffRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.[2]).toBe("staff");
		expect(rows[0]?.[3]).toBe(true);
	});

	it("links the publisher's identity to that person", () => {
		const links = sql<[number]>(
			DATABASE,
			"SELECT person_id FROM auth_provider_link",
		);
		expect(links).toHaveLength(1);
		expect(links[0]?.[0]).toBe(staffRows()[0]?.[1]);
	});
});

describe("inviteStaff", () => {
	it("refuses a stranger", () => {
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
	});

	it("lets the publisher invite a volunteer, and is idempotent", () => {
		expect(
			call(DATABASE, "invite_staff", ["V@Example.org ", "Val", "volunteer"]),
		).toBeNull();
		expect(
			call(DATABASE, "invite_staff", ["v@example.org", "Val", "volunteer"]),
		).toBeNull();
		const rows = staffRows();
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r[2]).sort()).toEqual(["staff", "volunteer"]);
		const people = sql<[string]>(
			DATABASE,
			"SELECT email FROM person WHERE email = 'v@example.org'",
		);
		expect(people).toHaveLength(1);
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
});

describe("setStaffActive / setStaffRole", () => {
	function publisherStaffId(): number {
		const row = staffRows().find((r) => r[2] === "staff" && r[1] === 1);
		if (!row) throw new Error("publisher staff row missing");
		return row[0];
	}
	function volunteerStaffId(): number {
		const row = staffRows().find((r) => r[2] === "volunteer");
		if (!row) throw new Error("volunteer staff row missing");
		return row[0];
	}

	it("refuses a stranger", () => {
		const err = call(
			DATABASE,
			"set_staff_active",
			[volunteerStaffId(), false],
			{
				anonymous: true,
			},
		);
		expect(err).toContain("not authorized");
	});

	it("will not let the caller deactivate or demote themselves", () => {
		expect(
			call(DATABASE, "set_staff_active", [publisherStaffId(), false]),
		).toContain("your own status");
		expect(
			call(DATABASE, "set_staff_role", [publisherStaffId(), "volunteer"]),
		).toContain("your own role");
	});

	it("deactivates and reactivates someone else", () => {
		const id = volunteerStaffId();
		expect(call(DATABASE, "set_staff_active", [id, false])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[3]).toBe(false);
		expect(call(DATABASE, "set_staff_active", [id, true])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[3]).toBe(true);
	});

	it("changes someone else's role", () => {
		const id = volunteerStaffId();
		expect(call(DATABASE, "set_staff_role", [id, "treasurer"])).toBeNull();
		expect(staffRows().find((r) => r[0] === id)?.[2]).toBe("treasurer");
		expect(call(DATABASE, "set_staff_role", [id, "volunteer"])).toBeNull();
	});
});
