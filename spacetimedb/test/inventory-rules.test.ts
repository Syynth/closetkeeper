import { describe, expect, it } from "vitest";
import {
	intakeKindFor,
	isBagKind,
	MOVEMENT_KINDS,
	SEED_CATEGORIES,
	SEED_CONDITIONS,
	SEED_GENDERS,
	SEED_SCALES,
	seedSortOrder,
	slotKey,
} from "../src/inventory-rules";

describe("inventory seeds", () => {
	it("every category points at a seeded scale", () => {
		const keys = new Set(SEED_SCALES.map((s) => s.key));
		for (const c of SEED_CATEGORIES)
			expect(keys.has(c.scale), c.label).toBe(true);
	});

	it("labels are unique within a scale and among categories", () => {
		for (const s of SEED_SCALES) {
			expect(new Set(s.sizes).size, s.key).toBe(s.sizes.length);
		}
		const labels = SEED_CATEGORIES.map((c) => c.label);
		expect(new Set(labels).size).toBe(labels.length);
		expect(new Set(SEED_GENDERS).size).toBe(SEED_GENDERS.length);
	});

	it("at least one condition is shelved and one is not", () => {
		expect(SEED_CONDITIONS.some((c) => c.shelved)).toBe(true);
		expect(SEED_CONDITIONS.some((c) => !c.shelved)).toBe(true);
	});

	it("sort orders step by ten from ten", () => {
		expect(seedSortOrder(0)).toBe(10);
		expect(seedSortOrder(4)).toBe(50);
	});
});

describe("inventory rules", () => {
	it("bag kinds map to intake movement kinds", () => {
		expect(isBagKind("donated")).toBe(true);
		expect(isBagKind("stolen")).toBe(false);
		expect(intakeKindFor("donated")).toBe("intake_donated");
		expect(intakeKindFor("purchased")).toBe("intake_purchased");
		for (const k of ["intake_donated", "intake_purchased"])
			expect(MOVEMENT_KINDS).toContain(k);
	});

	it("slot keys are the four ids in order", () => {
		expect(slotKey(1n, 2n, 3n, 4n)).toBe("1:2:3:4");
		expect(slotKey(1n, 2n, 3n, 4n)).not.toBe(slotKey(1n, 2n, 4n, 3n));
	});
});
