/**
 * Inventory seeds, run by init once per database. Everything here is
 * editable afterwards through the vocabulary reducers. Kept apart from
 * inventory.ts because that file is re-exported wholesale as module
 * exports, and the host rejects a plain function there.
 */
import type { Ctx } from "./auth";
import {
	SEED_CATEGORIES,
	SEED_CONDITIONS,
	SEED_GENDERS,
	SEED_LOCATIONS,
	SEED_SCALES,
	seedSortOrder,
} from "./inventory-rules";

export function seedInventoryRows(ctx: Ctx): void {
	const scaleIds = new Map<string, bigint>();
	for (const scale of SEED_SCALES) {
		const row = ctx.db.scale.insert({
			id: 0n,
			key: scale.key,
			label: scale.label,
		});
		scaleIds.set(scale.key, row.id);
		scale.sizes.forEach((label, i) => {
			ctx.db.size.insert({
				id: 0n,
				scale_id: row.id,
				label,
				sort_order: seedSortOrder(i),
				active: true,
			});
		});
	}
	SEED_CATEGORIES.forEach((c, i) => {
		const scale_id = scaleIds.get(c.scale);
		if (scale_id === undefined)
			throw new Error(`seed scale ${c.scale} missing`);
		ctx.db.category.insert({
			id: 0n,
			label: c.label,
			scale_id,
			sort_order: seedSortOrder(i),
			active: true,
		});
	});
	SEED_GENDERS.forEach((label, i) => {
		ctx.db.gender.insert({
			id: 0n,
			label,
			sort_order: seedSortOrder(i),
			active: true,
		});
	});
	SEED_CONDITIONS.forEach((c, i) => {
		ctx.db.condition.insert({
			id: 0n,
			label: c.label,
			sort_order: seedSortOrder(i),
			active: true,
			shelved: c.shelved,
		});
	});
	SEED_LOCATIONS.forEach((label, i) => {
		ctx.db.location.insert({
			id: 0n,
			label,
			label_code: "",
			sort_order: seedSortOrder(i),
			active: true,
		});
	});
}
