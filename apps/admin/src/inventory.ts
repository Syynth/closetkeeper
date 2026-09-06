/**
 * Reading the closet. The module owns the truth; this file turns its views
 * into the shapes the screens actually need, and holds the pure bits of
 * logic (what a filter matches, which bin to suggest) so they can be read
 * without a component around them.
 */
import { tables } from "@closetkeeper/bindings";
import { useTable } from "spacetimedb/react";

export interface Vocab {
	categories: Array<{
		categoryId: bigint;
		label: string;
		scaleId: bigint;
		sortOrder: number;
		active: boolean;
	}>;
	sizes: Array<{
		sizeId: bigint;
		scaleId: bigint;
		label: string;
		sortOrder: number;
		active: boolean;
	}>;
	genders: Array<{
		genderId: bigint;
		label: string;
		sortOrder: number;
		active: boolean;
	}>;
	conditions: Array<{
		conditionId: bigint;
		label: string;
		sortOrder: number;
		active: boolean;
		shelved: boolean;
	}>;
	locations: Array<{
		locationId: bigint;
		label: string;
		sortOrder: number;
		active: boolean;
	}>;
	ready: boolean;
}

const bySort = <T extends { sortOrder: number; label: string }>(a: T, b: T) =>
	a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);

/** Every vocabulary, in its own order. Inactive rows are kept: history needs them. */
export function useVocab(): Vocab {
	const [categories, c1] = useTable(tables.categoryOptions);
	const [sizes, c2] = useTable(tables.sizeOptions);
	const [genders, c3] = useTable(tables.genderOptions);
	const [conditions, c4] = useTable(tables.conditionOptions);
	const [locations, c5] = useTable(tables.locationOptions);
	return {
		categories: [...categories].sort(bySort),
		sizes: [...sizes].sort(bySort),
		genders: [...genders].sort(bySort),
		conditions: [...conditions].sort(bySort),
		locations: [...locations].sort(bySort),
		ready: c1 && c2 && c3 && c4 && c5,
	};
}

/**
 * What is on the shelves right now, one row per slot, with the count the
 * current filter implies: the slot's total, or just one bin's share of it.
 */
export interface Cell {
	slotId: bigint;
	categoryId: bigint;
	sizeId: bigint;
	genderId: bigint;
	conditionId: bigint;
	categoryLabel: string;
	sizeLabel: string;
	genderLabel: string;
	conditionLabel: string;
	sizeSort: number;
	shelved: boolean;
	onHand: number;
	/** Bins holding any of this slot, ignoring the filter. */
	binCount: number;
}

export interface StockFilter {
	/** null: every gender. */
	genderId: bigint | null;
	/** null: every bin, and counts are slot totals. */
	locationId: bigint | null;
	/** null: whatever is shelved, which is the useful default. */
	conditionIds: bigint[] | null;
}

export const NO_FILTER: StockFilter = {
	genderId: null,
	locationId: null,
	conditionIds: null,
};

export function isFiltered(f: StockFilter): boolean {
	return (
		f.genderId !== null || f.locationId !== null || f.conditionIds !== null
	);
}

/** Whether a cell survives the filter. Condition and gender only; the bin is a count, not a match. */
export function matches(cell: Cell, f: StockFilter): boolean {
	if (f.genderId !== null && cell.genderId !== f.genderId) return false;
	if (f.conditionIds === null) return cell.shelved;
	return f.conditionIds.includes(cell.conditionId);
}

export function useStock(filter: StockFilter) {
	const [shelves, shelvesReady] = useTable(tables.shelves);
	const [bins, binsReady] = useTable(tables.binLevels);

	const inBin = new Map<string, number>();
	if (filter.locationId !== null) {
		for (const b of bins) {
			if (b.locationId === filter.locationId)
				inBin.set(String(b.slotId), b.onHand);
		}
	}

	const cells: Cell[] = shelves.map((s) => ({
		slotId: s.slotId,
		categoryId: s.categoryId,
		sizeId: s.sizeId,
		genderId: s.genderId,
		conditionId: s.conditionId,
		categoryLabel: s.categoryLabel,
		sizeLabel: s.sizeLabel,
		genderLabel: s.genderLabel,
		conditionLabel: s.conditionLabel,
		sizeSort: s.sizeSort,
		shelved: s.shelved,
		binCount: s.binCount,
		onHand:
			filter.locationId === null
				? s.onHand
				: (inBin.get(String(s.slotId)) ?? 0),
	}));

	return {
		cells: cells.filter((c) => matches(c, filter)),
		bins,
		ready: shelvesReady && binsReady,
	};
}

/** Every bin that holds any of one slot, biggest first. */
export function binsFor(
	bins: ReadonlyArray<{
		slotId: bigint;
		locationId: bigint;
		locationLabel: string;
		locationSort: number;
		onHand: number;
	}>,
	slotId: bigint,
) {
	return bins
		.filter((b) => b.slotId === slotId && b.onHand > 0)
		.sort((a, b) => b.onHand - a.onHand || a.locationSort - b.locationSort);
}

/**
 * Where a new line should go, and why. The bin already holding the most of
 * exactly this, then the most of the same category and size in any gender,
 * then whatever this bag last used. Null means the module's own default,
 * which is the first active bin.
 */
export function suggestBin(
	bins: ReadonlyArray<{
		slotId: bigint;
		locationId: bigint;
		locationLabel: string;
		onHand: number;
	}>,
	cells: ReadonlyArray<Cell>,
	want: {
		categoryId: bigint;
		sizeId: bigint;
		genderId: bigint;
		conditionId: bigint;
	},
	lastUsed: { locationId: bigint; label: string } | null,
): { locationId: bigint; label: string; why: string } | null {
	const slot = cells.find(
		(c) =>
			c.categoryId === want.categoryId &&
			c.sizeId === want.sizeId &&
			c.genderId === want.genderId &&
			c.conditionId === want.conditionId,
	);
	if (slot) {
		const [best] = binsFor(
			bins.map((b) => ({ ...b, locationSort: 0 })),
			slot.slotId,
		);
		if (best)
			return {
				locationId: best.locationId,
				label: best.locationLabel,
				why: "these already live there",
			};
	}
	const kin = cells.filter(
		(c) => c.categoryId === want.categoryId && c.sizeId === want.sizeId,
	);
	let bestKin: { locationId: bigint; label: string; onHand: number } | null =
		null;
	for (const c of kin) {
		for (const b of bins) {
			if (b.slotId !== c.slotId || b.onHand <= 0) continue;
			if (bestKin === null || b.onHand > bestKin.onHand)
				bestKin = {
					locationId: b.locationId,
					label: b.locationLabel,
					onHand: b.onHand,
				};
		}
	}
	if (bestKin)
		return {
			locationId: bestKin.locationId,
			label: bestKin.label,
			why: `that size lives there`,
		};
	if (lastUsed)
		return {
			locationId: lastUsed.locationId,
			label: lastUsed.label,
			why: "the last one you used",
		};
	return null;
}

/** Bars for one category, one per size on its scale, in the scale's order. */
export function spread(
	cells: ReadonlyArray<Cell>,
	categoryId: bigint,
): number[] {
	const bySize = new Map<string, { sort: number; n: number }>();
	for (const c of cells) {
		if (c.categoryId !== categoryId) continue;
		const key = String(c.sizeId);
		const at = bySize.get(key) ?? { sort: c.sizeSort, n: 0 };
		at.n += c.onHand;
		bySize.set(key, at);
	}
	return [...bySize.values()].sort((a, b) => a.sort - b.sort).map((x) => x.n);
}

export function totalOf(cells: ReadonlyArray<Cell>, categoryId?: bigint) {
	return cells
		.filter((c) => categoryId === undefined || c.categoryId === categoryId)
		.reduce((n, c) => n + c.onHand, 0);
}
