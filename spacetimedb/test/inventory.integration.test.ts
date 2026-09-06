/**
 * Bags, counts, and vocabularies against a real local instance. The CLI
 * identity is the seeded publisher, a system administrator, so it holds
 * inventory.write and inventory.manage. Anonymous callers prove the gate.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalInstance, call, publish, sql, sqlAs } from "./harness";

const DATABASE = "closetkeeper-test-inventory";

function idOf(rows: Array<[number, string]>, label: string): number {
	const row = rows.find((r) => r[1] === label);
	if (!row) throw new Error(`${label} not seeded`);
	return row[0];
}

function vocab() {
	const categories = sql<[number, string]>(
		DATABASE,
		"SELECT category_id, label FROM category_options",
	);
	const sizes = sql<[number, string, number]>(
		DATABASE,
		"SELECT size_id, label, scale_id FROM size_options",
	);
	const genders = sql<[number, string]>(
		DATABASE,
		"SELECT gender_id, label FROM gender_options",
	);
	const conditions = sql<[number, string]>(
		DATABASE,
		"SELECT condition_id, label FROM condition_options",
	);
	const scales = sql<[number, string]>(
		DATABASE,
		"SELECT scale_id, key FROM scale_options",
	);
	const clothing = idOf(scales, "clothing");
	const sizeOn = (scale: number, label: string) => {
		const row = sizes.find((r) => r[1] === label && r[2] === scale);
		if (!row) throw new Error(`size ${label} not on scale ${scale}`);
		return row[0];
	};
	return {
		socks: idOf(categories, "Socks"),
		shoes: idOf(categories, "Shoes"),
		size6: sizeOn(clothing, "6"),
		neutral: idOf(genders, "Neutral"),
		good: idOf(conditions, "Good"),
		clothing,
	};
}

function levels(): Map<number, number> {
	return new Map(
		sql<[number, number]>(DATABASE, "SELECT slot_id, on_hand FROM shelves"),
	);
}

function ledgerSums(): Map<number, number> {
	const sums = new Map<number, number>();
	for (const [slot, delta] of sql<[number, number]>(
		DATABASE,
		"SELECT slot_id, delta FROM stock_movement",
	))
		sums.set(slot, (sums.get(slot) ?? 0) + delta);
	return sums;
}

describe("inventory", () => {
	beforeAll(async () => {
		await assertLocalInstance();
		publish(DATABASE);
	});

	it("init seeds the vocabularies", () => {
		expect(
			sql(DATABASE, "SELECT category_id FROM category_options"),
		).toHaveLength(9);
		expect(sql(DATABASE, "SELECT gender_id FROM gender_options")).toHaveLength(
			3,
		);
		expect(
			sql(DATABASE, "SELECT condition_id FROM condition_options"),
		).toHaveLength(3);
		expect(sql(DATABASE, "SELECT scale_id FROM scale_options")).toHaveLength(3);
		expect(
			sql(DATABASE, "SELECT size_id FROM size_options").length,
		).toBeGreaterThan(40);
		expect(
			sqlAs(DATABASE, "SELECT size_id FROM size_options", { anonymous: true }),
		).toEqual([]);
	});

	it("refuses to seed twice", () => {
		expect(call(DATABASE, "seed_inventory", [])).toContain("already seeded");
		expect(
			sql(DATABASE, "SELECT category_id FROM category_options"),
		).toHaveLength(9);
	});

	it("a bag of socks: open, add lines, close, and the shelves move once", () => {
		const v = vocab();
		expect(
			call(DATABASE, "open_bag", ["donated", "Tuesday drop-off"]),
		).toBeNull();
		const bags = sql<[number, string, string]>(
			DATABASE,
			"SELECT bag_id, kind, status FROM bag_list",
		);
		expect(bags).toEqual([[expect.any(Number), "donated", "open"]]);
		const bagId = bags[0]?.[0] ?? 0;

		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.socks,
				v.size6,
				v.neutral,
				v.good,
				0,
				5,
			]),
		).toBeNull();
		// 0 for the bin means the first active one, which init seeds as Shelves.
		// The same slot and bin again increments the line rather than adding one.
		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.socks,
				v.size6,
				v.neutral,
				v.good,
				0,
				3,
			]),
		).toBeNull();
		const lines = sql<[number, number, string]>(
			DATABASE,
			"SELECT line_id, count, category_label FROM bag_lines",
		);
		expect(lines).toEqual([[expect.any(Number), 8, "Socks"]]);

		// The slot exists at zero until the bag closes.
		const before = levels();
		expect(before.size).toBe(1);
		expect([...before.values()]).toEqual([0]);

		expect(call(DATABASE, "close_bag", [bagId])).toBeNull();
		expect([...levels().values()]).toEqual([8]);
		const ledger = sql<[number, string]>(
			DATABASE,
			"SELECT delta, kind FROM stock_ledger",
		);
		expect(ledger).toEqual([[8, "intake_donated"]]);

		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.socks,
				v.size6,
				v.neutral,
				v.good,
				0,
				1,
			]),
		).toContain("closed");
		expect(call(DATABASE, "close_bag", [bagId])).toContain("closed");
	});

	it("hands out, refuses to overdraw, and corrects with a reason", () => {
		const [[slotId]] = sql<[number]>(
			DATABASE,
			"SELECT slot_id FROM shelves",
		) as [[number]];
		expect(call(DATABASE, "hand_out", [slotId, 0, 3, ""])).toBeNull();
		expect(levels().get(slotId)).toBe(5);
		expect(call(DATABASE, "hand_out", [slotId, 0, 9, ""])).toContain(
			"only 5 of those in that bin",
		);
		expect(call(DATABASE, "correct_count", [slotId, 0, 4, ""])).toContain(
			"reason",
		);
		expect(
			call(DATABASE, "correct_count", [slotId, 0, 4, "recount"]),
		).toBeNull();
		expect(levels().get(slotId)).toBe(4);
		expect(call(DATABASE, "correct_count", [slotId, 0, 4, "again"])).toContain(
			"already",
		);
		const kinds = sql<[string, number]>(
			DATABASE,
			"SELECT kind, delta FROM stock_ledger",
		).map((r) => r.join(":"));
		expect(kinds).toEqual([
			"intake_donated:8",
			"handed_out:-3",
			"correction:-1",
		]);
	});

	it("the level cache equals the ledger", () => {
		const lv = levels();
		const sums = ledgerSums();
		for (const [slot, on_hand] of lv)
			expect(sums.get(slot) ?? 0, `slot ${slot}`).toBe(on_hand);
	});

	it("refuses a size that is not on the category's scale, and strangers", () => {
		const v = vocab();
		expect(call(DATABASE, "open_bag", ["purchased", ""])).toBeNull();
		const open = sql<[number, string]>(
			DATABASE,
			"SELECT bag_id, status FROM bag_list",
		).find((b) => b[1] === "open");
		const bagId = open?.[0] ?? 0;
		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.shoes,
				v.size6,
				v.neutral,
				v.good,
				0,
				1,
			]),
		).toContain("scale");
		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.socks,
				v.size6,
				v.neutral,
				v.good,
				0,
				0,
			]),
		).toContain("at least 1");
		expect(
			call(DATABASE, "open_bag", ["donated", ""], { anonymous: true }),
		).toContain("not authorized");
		expect(call(DATABASE, "open_bag", ["found", ""])).toContain(
			"donated or purchased",
		);
	});

	it("staff can grow the vocabularies without a republish", () => {
		const v = vocab();
		expect(call(DATABASE, "add_size", [v.clothing, " Youth XXL "])).toBeNull();
		const added = sql<[number, string, boolean]>(
			DATABASE,
			"SELECT size_id, label, active FROM size_options",
		).find((r) => r[1] === "Youth XXL");
		expect(added?.[2]).toBe(true);
		expect(
			call(DATABASE, "update_size", [added?.[0] ?? 0, "Youth XXL", 999, false]),
		).toBeNull();
		expect(call(DATABASE, "add_size", [v.clothing, "   "])).toContain(
			"required",
		);
		expect(
			call(DATABASE, "add_category", ["Accessories", v.clothing]),
		).toBeNull();
		expect(
			sql(DATABASE, "SELECT category_id FROM category_options"),
		).toHaveLength(10);
		expect(
			call(DATABASE, "add_size", [v.clothing, "X"], { anonymous: true }),
		).toContain("not authorized");
	});

	it("counts live in a bin, and a bin holding stock cannot be retired", () => {
		const v = vocab();
		const bins = sql<[number, string]>(
			DATABASE,
			"SELECT location_id, label FROM location_options",
		);
		const shelves = idOf(bins, "Shelves");
		const door = idOf(bins, "Door");

		// The same slot in a second bin: one slot, two bin rows.
		expect(call(DATABASE, "open_bag", ["donated", ""])).toBeNull();
		const bagId =
			sql<[number, string]>(
				DATABASE,
				"SELECT bag_id, status FROM bag_list",
			).find((b) => b[1] === "open")?.[0] ?? 0;
		expect(
			call(DATABASE, "add_bag_line", [
				bagId,
				v.socks,
				v.size6,
				v.neutral,
				v.good,
				door,
				4,
			]),
		).toBeNull();
		expect(call(DATABASE, "close_bag", [bagId])).toBeNull();

		const byBin = sql<[number, string, number]>(
			DATABASE,
			"SELECT slot_id, location_label, on_hand FROM bin_levels",
		);
		const socksSlot = byBin.find((r) => r[1] === "Door")?.[0] ?? 0;
		expect(
			byBin
				.filter((r) => r[0] === socksSlot)
				.map((r) => [r[1], r[2]])
				.sort(),
		).toEqual([
			["Door", 4],
			["Shelves", 4],
		]);

		// The slot's total is the sum of its bins, and the client is told how
		// many bins hold it, which is what decides whether handing out asks.
		const shelf = sql<[number, number, number]>(
			DATABASE,
			"SELECT slot_id, on_hand, bin_count FROM shelves",
		).find((r) => r[0] === socksSlot);
		expect(shelf?.[1]).toBe(8);
		expect(shelf?.[2]).toBe(2);

		// Handing out is per bin: the Door only has four.
		expect(call(DATABASE, "hand_out", [socksSlot, door, 5, ""])).toContain(
			"only 4 of those in that bin",
		);
		expect(call(DATABASE, "hand_out", [socksSlot, door, 4, ""])).toBeNull();

		// Retiring a bin that still holds something is refused; an empty one is fine.
		expect(
			call(DATABASE, "update_location", [shelves, "Shelves", 10, false]),
		).toContain("still holds");
		expect(
			call(DATABASE, "update_location", [door, "Door", 20, false]),
		).toBeNull();
		expect(
			call(DATABASE, "update_location", [door, "Door", 20, true]),
		).toBeNull();
	});

	it("every slot's bins sum to its total", () => {
		const totals = new Map(
			sql<[number, number]>(DATABASE, "SELECT slot_id, on_hand FROM shelves"),
		);
		const perBin = new Map<number, number>();
		for (const [slot, n] of sql<[number, number]>(
			DATABASE,
			"SELECT slot_id, on_hand FROM bin_levels",
		))
			perBin.set(slot, (perBin.get(slot) ?? 0) + n);
		for (const [slot, total] of totals)
			if (total > 0) expect(perBin.get(slot) ?? 0, `slot ${slot}`).toBe(total);
	});
});
