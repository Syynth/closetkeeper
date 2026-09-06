/**
 * Inventory views and reducers. Shape in docs/design/inventory.md; seeds in
 * inventory-seed.ts. Only SpacetimeDB exports may live here: index.ts
 * re-exports this whole file and the host rejects anything else.
 *
 * Counts are the source of truth. Every change to a count goes through
 * `applyMovement`, which writes the ledger row and updates the per-slot
 * cache in the same transaction, so the two cannot drift.
 */
import { Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import { defineAdminReducer } from "./admin-reducer";
import { type Ctx, type ReadCtx, resolveStaff } from "./auth";
import {
	type BagKind,
	intakeKindFor,
	isBagKind,
	type MovementKind,
	normalizeLabel,
	slotKey,
} from "./inventory-rules";
import { seedInventoryRows } from "./inventory-seed";
import spacetimedb from "./schema";

const NEVER = new Timestamp(0n);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canRead(ctx: ReadCtx): boolean {
	return resolveStaff(ctx)?.capabilities.has("inventory.read") ?? false;
}

function requireLabel(label: string): string {
	const clean = normalizeLabel(label);
	if (clean.length === 0) throw new SenderError("label is required");
	return clean;
}

function staffName(ctx: ReadCtx, staffId: bigint): string {
	const staff = ctx.db.staff_member.id.find(staffId);
	if (staff === null) return "";
	return ctx.db.person.id.find(staff.person_id)?.display_name ?? "";
}

/** The four labels a slot resolves to, for views. */
function describeSlot(ctx: ReadCtx, slotId: bigint) {
	const slot = ctx.db.slot.id.find(slotId);
	if (slot === null) return null;
	const category = ctx.db.category.id.find(slot.category_id);
	const size = ctx.db.size.id.find(slot.size_id);
	const gender = ctx.db.gender.id.find(slot.gender_id);
	const condition = ctx.db.condition.id.find(slot.condition_id);
	if (!category || !size || !gender || !condition) return null;
	return { slot, category, size, gender, condition };
}

/**
 * Find the slot for a combination, creating it (and its zero level) on
 * first use. Refuses inactive vocabulary and a size not on the category's
 * scale; an existing slot is returned as is, so retired vocabulary keeps
 * its history.
 */
function findOrCreateSlot(
	ctx: Ctx,
	category_id: bigint,
	size_id: bigint,
	gender_id: bigint,
	condition_id: bigint,
): bigint {
	const key = slotKey(category_id, size_id, gender_id, condition_id);
	const existing = ctx.db.slot.key.find(key);
	if (existing !== null) return existing.id;

	const category = ctx.db.category.id.find(category_id);
	if (category === null || !category.active)
		throw new SenderError("no such category");
	const size = ctx.db.size.id.find(size_id);
	if (size === null || !size.active) throw new SenderError("no such size");
	if (size.scale_id !== category.scale_id)
		throw new SenderError("that size is not on this category's scale");
	const gender = ctx.db.gender.id.find(gender_id);
	if (gender === null || !gender.active)
		throw new SenderError("no such gender");
	const condition = ctx.db.condition.id.find(condition_id);
	if (condition === null || !condition.active)
		throw new SenderError("no such condition");

	const slot = ctx.db.slot.insert({
		id: 0n,
		key,
		category_id,
		size_id,
		gender_id,
		condition_id,
	});
	ctx.db.stock_level.insert({ slot_id: slot.id, on_hand: 0 });
	return slot.id;
}

function onHand(ctx: ReadCtx, slotId: bigint): number {
	return ctx.db.stock_level.slot_id.find(slotId)?.on_hand ?? 0;
}

/** The only writer of the ledger and the level cache. */
function applyMovement(
	ctx: Ctx,
	staffId: bigint,
	slotId: bigint,
	delta: number,
	kind: MovementKind,
	extra: { bag_line_id?: bigint; item_id?: bigint; note?: string } = {},
): void {
	if (delta === 0) return;
	ctx.db.stock_movement.insert({
		id: 0n,
		slot_id: slotId,
		delta,
		kind,
		at: ctx.timestamp,
		staff_id: staffId,
		bag_line_id: extra.bag_line_id ?? 0n,
		item_id: extra.item_id ?? 0n,
		note: extra.note ?? "",
	});
	const level = ctx.db.stock_level.slot_id.find(slotId);
	if (level === null) {
		ctx.db.stock_level.insert({ slot_id: slotId, on_hand: delta });
	} else {
		ctx.db.stock_level.slot_id.update({
			...level,
			on_hand: level.on_hand + delta,
		});
	}
}

function requireOpenBag(ctx: Ctx, bagId: bigint) {
	const bag = ctx.db.bag.id.find(bagId);
	if (bag === null) throw new SenderError("no such bag");
	if (bag.status !== "open") throw new SenderError("that bag is closed");
	return bag;
}

// ---------------------------------------------------------------------------
// Views: vocabularies. Every row, active or not; intake filters client-side
// and the More screens show the inactive ones greyed.
// ---------------------------------------------------------------------------

const ScaleOption = t.row("ScaleOption", {
	scale_id: t.u64().primaryKey(),
	key: t.string(),
	label: t.string(),
});

export const scaleOptions = spacetimedb.view(
	{ name: "scale_options", public: true },
	t.array(ScaleOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.scale.iter()].map((s) => ({
			scale_id: s.id,
			key: s.key,
			label: s.label,
		}));
	},
);

const SizeOption = t.row("SizeOption", {
	size_id: t.u64().primaryKey(),
	scale_id: t.u64(),
	label: t.string(),
	sort_order: t.u32(),
	active: t.bool(),
});

export const sizeOptions = spacetimedb.view(
	{ name: "size_options", public: true },
	t.array(SizeOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.size.iter()].map((s) => ({
			size_id: s.id,
			scale_id: s.scale_id,
			label: s.label,
			sort_order: s.sort_order,
			active: s.active,
		}));
	},
);

const CategoryOption = t.row("CategoryOption", {
	category_id: t.u64().primaryKey(),
	label: t.string(),
	scale_id: t.u64(),
	sort_order: t.u32(),
	active: t.bool(),
});

export const categoryOptions = spacetimedb.view(
	{ name: "category_options", public: true },
	t.array(CategoryOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.category.iter()].map((c) => ({
			category_id: c.id,
			label: c.label,
			scale_id: c.scale_id,
			sort_order: c.sort_order,
			active: c.active,
		}));
	},
);

const GenderOption = t.row("GenderOption", {
	gender_id: t.u64().primaryKey(),
	label: t.string(),
	sort_order: t.u32(),
	active: t.bool(),
});

export const genderOptions = spacetimedb.view(
	{ name: "gender_options", public: true },
	t.array(GenderOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.gender.iter()].map((g) => ({
			gender_id: g.id,
			label: g.label,
			sort_order: g.sort_order,
			active: g.active,
		}));
	},
);

const ConditionOption = t.row("ConditionOption", {
	condition_id: t.u64().primaryKey(),
	label: t.string(),
	sort_order: t.u32(),
	active: t.bool(),
	shelved: t.bool(),
});

export const conditionOptions = spacetimedb.view(
	{ name: "condition_options", public: true },
	t.array(ConditionOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.condition.iter()].map((c) => ({
			condition_id: c.id,
			label: c.label,
			sort_order: c.sort_order,
			active: c.active,
			shelved: c.shelved,
		}));
	},
);

const LocationOption = t.row("LocationOption", {
	location_id: t.u64().primaryKey(),
	label: t.string(),
	sort_order: t.u32(),
	active: t.bool(),
});

export const locationOptions = spacetimedb.view(
	{ name: "location_options", public: true },
	t.array(LocationOption),
	(ctx) => {
		if (!canRead(ctx)) return [];
		return [...ctx.db.location.iter()].map((l) => ({
			location_id: l.id,
			label: l.label,
			sort_order: l.sort_order,
			active: l.active,
		}));
	},
);

// ---------------------------------------------------------------------------
// Views: counts and bags
// ---------------------------------------------------------------------------

/** One cell of the shelves: a slot with its labels and count. */
const ShelfCell = t.row("ShelfCell", {
	slot_id: t.u64().primaryKey(),
	category_id: t.u64(),
	size_id: t.u64(),
	gender_id: t.u64(),
	condition_id: t.u64(),
	category_label: t.string(),
	size_label: t.string(),
	gender_label: t.string(),
	condition_label: t.string(),
	category_sort: t.u32(),
	size_sort: t.u32(),
	gender_sort: t.u32(),
	condition_sort: t.u32(),
	shelved: t.bool(),
	on_hand: t.i32(),
});

/** Every slot that has ever been counted, including ones now at zero. */
export const shelves = spacetimedb.view(
	{ name: "shelves", public: true },
	t.array(ShelfCell),
	(ctx) => {
		if (!canRead(ctx)) return [];
		const out = [];
		for (const level of ctx.db.stock_level.iter()) {
			const d = describeSlot(ctx, level.slot_id);
			if (d === null) continue;
			out.push({
				slot_id: level.slot_id,
				category_id: d.category.id,
				size_id: d.size.id,
				gender_id: d.gender.id,
				condition_id: d.condition.id,
				category_label: d.category.label,
				size_label: d.size.label,
				gender_label: d.gender.label,
				condition_label: d.condition.label,
				category_sort: d.category.sort_order,
				size_sort: d.size.sort_order,
				gender_sort: d.gender.sort_order,
				condition_sort: d.condition.sort_order,
				shelved: d.condition.shelved,
				on_hand: level.on_hand,
			});
		}
		return out;
	},
);

const BagSummary = t.row("BagSummary", {
	bag_id: t.u64().primaryKey(),
	kind: t.string(),
	status: t.string(),
	opened_at: t.timestamp(),
	opened_by_name: t.string(),
	closed_at: t.timestamp(),
	line_count: t.u32(),
	item_count: t.u32(),
	note: t.string(),
});

export const bagList = spacetimedb.view(
	{ name: "bag_list", public: true },
	t.array(BagSummary),
	(ctx) => {
		if (!canRead(ctx)) return [];
		const out = [];
		for (const bag of ctx.db.bag.iter()) {
			let line_count = 0;
			let item_count = 0;
			for (const line of ctx.db.bag_line.bag_id.filter(bag.id)) {
				line_count += 1;
				item_count += line.count;
			}
			out.push({
				bag_id: bag.id,
				kind: bag.kind,
				status: bag.status,
				opened_at: bag.opened_at,
				opened_by_name: staffName(ctx, bag.opened_by),
				closed_at: bag.closed_at,
				line_count,
				item_count,
				note: bag.note,
			});
		}
		return out;
	},
);

const BagLineEntry = t.row("BagLineEntry", {
	line_id: t.u64().primaryKey(),
	bag_id: t.u64(),
	slot_id: t.u64(),
	category_label: t.string(),
	size_label: t.string(),
	gender_label: t.string(),
	condition_label: t.string(),
	count: t.u32(),
	created_at: t.timestamp(),
});

/** Every line of every bag; the client filters by bag. Volumes are small. */
export const bagLines = spacetimedb.view(
	{ name: "bag_lines", public: true },
	t.array(BagLineEntry),
	(ctx) => {
		if (!canRead(ctx)) return [];
		const out = [];
		for (const line of ctx.db.bag_line.iter()) {
			const d = describeSlot(ctx, line.slot_id);
			if (d === null) continue;
			out.push({
				line_id: line.id,
				bag_id: line.bag_id,
				slot_id: line.slot_id,
				category_label: d.category.label,
				size_label: d.size.label,
				gender_label: d.gender.label,
				condition_label: d.condition.label,
				count: line.count,
				created_at: line.created_at,
			});
		}
		return out;
	},
);

const LedgerEntry = t.row("LedgerEntry", {
	movement_id: t.u64().primaryKey(),
	at: t.timestamp(),
	slot_id: t.u64(),
	category_label: t.string(),
	size_label: t.string(),
	gender_label: t.string(),
	condition_label: t.string(),
	delta: t.i32(),
	kind: t.string(),
	staff_name: t.string(),
	bag_line_id: t.u64(),
	note: t.string(),
});

/** The whole ledger with labels, for the export and the history screens. */
export const stockLedger = spacetimedb.view(
	{ name: "stock_ledger", public: true },
	t.array(LedgerEntry),
	(ctx) => {
		if (!canRead(ctx)) return [];
		const out = [];
		for (const m of ctx.db.stock_movement.iter()) {
			const d = describeSlot(ctx, m.slot_id);
			if (d === null) continue;
			out.push({
				movement_id: m.id,
				at: m.at,
				slot_id: m.slot_id,
				category_label: d.category.label,
				size_label: d.size.label,
				gender_label: d.gender.label,
				condition_label: d.condition.label,
				delta: m.delta,
				kind: m.kind,
				staff_name: staffName(ctx, m.staff_id),
				bag_line_id: m.bag_line_id,
				note: m.note,
			});
		}
		return out;
	},
);

// ---------------------------------------------------------------------------
// Reducers: vocabularies (inventory.manage)
// ---------------------------------------------------------------------------

/**
 * The same seed init runs, for a database created before these tables
 * existed (init runs once, ever). Refuses once any category exists, so it
 * can never double-seed or clobber edits.
 */
export const seedInventory = defineAdminReducer(
	{
		name: "seed_inventory",
		capability: "inventory.manage",
		args: {},
	},
	(ctx) => {
		for (const _ of ctx.db.category.iter())
			throw new SenderError("inventory is already seeded");
		seedInventoryRows(ctx);
		return { table: "category" };
	},
);

function nextSortOrder(rows: Iterable<{ sort_order: number }>): number {
	let max = 0;
	for (const r of rows) if (r.sort_order > max) max = r.sort_order;
	return max + 10;
}

export const addSize = defineAdminReducer(
	{
		name: "add_size",
		capability: "inventory.manage",
		args: { scale_id: t.u64(), label: t.string() },
	},
	(ctx, _me, { scale_id, label }) => {
		if (ctx.db.scale.id.find(scale_id) === null)
			throw new SenderError("no such size scale");
		const row = ctx.db.size.insert({
			id: 0n,
			scale_id,
			label: requireLabel(label),
			sort_order: nextSortOrder(ctx.db.size.scale_id.filter(scale_id)),
			active: true,
		});
		return { table: "size", id: row.id };
	},
);

export const updateSize = defineAdminReducer(
	{
		name: "update_size",
		capability: "inventory.manage",
		args: {
			size_id: t.u64(),
			label: t.string(),
			sort_order: t.u32(),
			active: t.bool(),
		},
	},
	(ctx, _me, { size_id, label, sort_order, active }) => {
		const row = ctx.db.size.id.find(size_id);
		if (row === null) throw new SenderError("no such size");
		ctx.db.size.id.update({
			...row,
			label: requireLabel(label),
			sort_order,
			active,
		});
		return { table: "size", id: size_id };
	},
);

export const addCategory = defineAdminReducer(
	{
		name: "add_category",
		capability: "inventory.manage",
		args: { label: t.string(), scale_id: t.u64() },
	},
	(ctx, _me, { label, scale_id }) => {
		if (ctx.db.scale.id.find(scale_id) === null)
			throw new SenderError("no such size scale");
		const row = ctx.db.category.insert({
			id: 0n,
			label: requireLabel(label),
			scale_id,
			sort_order: nextSortOrder(ctx.db.category.iter()),
			active: true,
		});
		return { table: "category", id: row.id };
	},
);

/** A category's scale is fixed once set: slots already reference its sizes. */
export const updateCategory = defineAdminReducer(
	{
		name: "update_category",
		capability: "inventory.manage",
		args: {
			category_id: t.u64(),
			label: t.string(),
			sort_order: t.u32(),
			active: t.bool(),
		},
	},
	(ctx, _me, { category_id, label, sort_order, active }) => {
		const row = ctx.db.category.id.find(category_id);
		if (row === null) throw new SenderError("no such category");
		ctx.db.category.id.update({
			...row,
			label: requireLabel(label),
			sort_order,
			active,
		});
		return { table: "category", id: category_id };
	},
);

export const addGender = defineAdminReducer(
	{
		name: "add_gender",
		capability: "inventory.manage",
		args: { label: t.string() },
	},
	(ctx, _me, { label }) => {
		const row = ctx.db.gender.insert({
			id: 0n,
			label: requireLabel(label),
			sort_order: nextSortOrder(ctx.db.gender.iter()),
			active: true,
		});
		return { table: "gender", id: row.id };
	},
);

export const updateGender = defineAdminReducer(
	{
		name: "update_gender",
		capability: "inventory.manage",
		args: {
			gender_id: t.u64(),
			label: t.string(),
			sort_order: t.u32(),
			active: t.bool(),
		},
	},
	(ctx, _me, { gender_id, label, sort_order, active }) => {
		const row = ctx.db.gender.id.find(gender_id);
		if (row === null) throw new SenderError("no such gender");
		ctx.db.gender.id.update({
			...row,
			label: requireLabel(label),
			sort_order,
			active,
		});
		return { table: "gender", id: gender_id };
	},
);

export const addCondition = defineAdminReducer(
	{
		name: "add_condition",
		capability: "inventory.manage",
		args: { label: t.string(), shelved: t.bool() },
	},
	(ctx, _me, { label, shelved }) => {
		const row = ctx.db.condition.insert({
			id: 0n,
			label: requireLabel(label),
			sort_order: nextSortOrder(ctx.db.condition.iter()),
			active: true,
			shelved,
		});
		return { table: "condition", id: row.id };
	},
);

export const updateCondition = defineAdminReducer(
	{
		name: "update_condition",
		capability: "inventory.manage",
		args: {
			condition_id: t.u64(),
			label: t.string(),
			sort_order: t.u32(),
			active: t.bool(),
			shelved: t.bool(),
		},
	},
	(ctx, _me, { condition_id, label, sort_order, active, shelved }) => {
		const row = ctx.db.condition.id.find(condition_id);
		if (row === null) throw new SenderError("no such condition");
		ctx.db.condition.id.update({
			...row,
			label: requireLabel(label),
			sort_order,
			active,
			shelved,
		});
		return { table: "condition", id: condition_id };
	},
);

export const addLocation = defineAdminReducer(
	{
		name: "add_location",
		capability: "inventory.manage",
		args: { label: t.string() },
	},
	(ctx, _me, { label }) => {
		const row = ctx.db.location.insert({
			id: 0n,
			label: requireLabel(label),
			label_code: "",
			sort_order: nextSortOrder(ctx.db.location.iter()),
			active: true,
		});
		return { table: "location", id: row.id };
	},
);

export const updateLocation = defineAdminReducer(
	{
		name: "update_location",
		capability: "inventory.manage",
		args: {
			location_id: t.u64(),
			label: t.string(),
			sort_order: t.u32(),
			active: t.bool(),
		},
	},
	(ctx, _me, { location_id, label, sort_order, active }) => {
		const row = ctx.db.location.id.find(location_id);
		if (row === null) throw new SenderError("no such location");
		ctx.db.location.id.update({
			...row,
			label: requireLabel(label),
			sort_order,
			active,
		});
		return { table: "location", id: location_id };
	},
);

// ---------------------------------------------------------------------------
// Reducers: bags and counts (inventory.write)
// ---------------------------------------------------------------------------

export const openBag = defineAdminReducer(
	{
		name: "open_bag",
		capability: "inventory.write",
		args: { kind: t.string(), note: t.string() },
		redact: ["note"],
	},
	(ctx, me, { kind, note }) => {
		if (!isBagKind(kind))
			throw new SenderError("bag kind must be donated or purchased");
		const bag = ctx.db.bag.insert({
			id: 0n,
			kind,
			status: "open",
			opened_at: ctx.timestamp,
			opened_by: me.staffId,
			closed_at: NEVER,
			closed_by: 0n,
			donor_person_id: 0n,
			note: note.trim(),
		});
		return { table: "bag", id: bag.id };
	},
);

/** Adds a line, or increments the bag's existing line for the same slot. */
export const addBagLine = defineAdminReducer(
	{
		name: "add_bag_line",
		capability: "inventory.write",
		args: {
			bag_id: t.u64(),
			category_id: t.u64(),
			size_id: t.u64(),
			gender_id: t.u64(),
			condition_id: t.u64(),
			count: t.u32(),
		},
	},
	(
		ctx,
		me,
		{ bag_id, category_id, size_id, gender_id, condition_id, count },
	) => {
		if (count === 0) throw new SenderError("count must be at least 1");
		requireOpenBag(ctx, bag_id);
		const slot_id = findOrCreateSlot(
			ctx,
			category_id,
			size_id,
			gender_id,
			condition_id,
		);
		for (const line of ctx.db.bag_line.bag_id.filter(bag_id)) {
			if (line.slot_id === slot_id) {
				ctx.db.bag_line.id.update({ ...line, count: line.count + count });
				return { table: "bag_line", id: line.id, details: { slot_id } };
			}
		}
		const line = ctx.db.bag_line.insert({
			id: 0n,
			bag_id,
			slot_id,
			count,
			created_at: ctx.timestamp,
			created_by: me.staffId,
		});
		return { table: "bag_line", id: line.id, details: { slot_id } };
	},
);

export const removeBagLine = defineAdminReducer(
	{
		name: "remove_bag_line",
		capability: "inventory.write",
		args: { line_id: t.u64() },
	},
	(ctx, _me, { line_id }) => {
		const line = ctx.db.bag_line.id.find(line_id);
		if (line === null) throw new SenderError("no such line");
		requireOpenBag(ctx, line.bag_id);
		ctx.db.bag_line.delete(line);
		return { table: "bag_line", id: line_id, details: { bag_id: line.bag_id } };
	},
);

/** Writes one intake movement per line and locks the bag. */
export const closeBag = defineAdminReducer(
	{
		name: "close_bag",
		capability: "inventory.write",
		args: { bag_id: t.u64() },
	},
	(ctx, me, { bag_id }) => {
		const bag = requireOpenBag(ctx, bag_id);
		const kind = intakeKindFor(bag.kind as BagKind);
		let lines = 0;
		for (const line of ctx.db.bag_line.bag_id.filter(bag_id)) {
			applyMovement(ctx, me.staffId, line.slot_id, line.count, kind, {
				bag_line_id: line.id,
			});
			lines += 1;
		}
		ctx.db.bag.id.update({
			...bag,
			status: "closed",
			closed_at: ctx.timestamp,
			closed_by: me.staffId,
		});
		return { table: "bag", id: bag_id, details: { lines } };
	},
);

/** Refuses to take more than is on hand: correct the count first. */
export const handOut = defineAdminReducer(
	{
		name: "hand_out",
		capability: "inventory.write",
		args: { slot_id: t.u64(), count: t.u32(), note: t.string() },
		redact: ["note"],
	},
	(ctx, me, { slot_id, count, note }) => {
		if (count === 0) throw new SenderError("count must be at least 1");
		if (ctx.db.slot.id.find(slot_id) === null)
			throw new SenderError("no such slot");
		const have = onHand(ctx, slot_id);
		if (count > have) throw new SenderError(`only ${have} on hand`);
		applyMovement(ctx, me.staffId, slot_id, -count, "handed_out", {
			note: note.trim(),
		});
		return { table: "slot", id: slot_id, details: { delta: -count } };
	},
);

/** A physical recount. The note says why; it is required. */
export const correctCount = defineAdminReducer(
	{
		name: "correct_count",
		capability: "inventory.write",
		args: { slot_id: t.u64(), on_hand: t.u32(), note: t.string() },
		redact: ["note"],
	},
	(ctx, me, { slot_id, on_hand, note }) => {
		if (ctx.db.slot.id.find(slot_id) === null)
			throw new SenderError("no such slot");
		const reason = note.trim();
		if (reason.length === 0) throw new SenderError("a reason is required");
		const delta = on_hand - onHand(ctx, slot_id);
		if (delta === 0) throw new SenderError("already that count");
		applyMovement(ctx, me.staffId, slot_id, delta, "correction", {
			note: reason,
		});
		return { table: "slot", id: slot_id, details: { delta } };
	},
);
