/**
 * Pure inventory rules and seed data. No database access, no runtime
 * imports from `spacetimedb/server`, so plain Vitest can test it.
 *
 * The shape is docs/design/inventory.md. Vocabularies (scales, sizes,
 * categories, genders, conditions, locations) are rows seeded by init and
 * edited by staff afterwards; what is here is only the starting point.
 * Movement kinds and bag kinds are code, because bookkeeping depends on
 * them.
 */

/** Why stock moved. Code, not rows: reports and receipts branch on these. */
export const MOVEMENT_KINDS = [
	"intake_donated",
	"intake_purchased",
	"handed_out",
	"discarded",
	"correction",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const BAG_KINDS = ["donated", "purchased"] as const;
export type BagKind = (typeof BAG_KINDS)[number];

export function isBagKind(value: string): value is BagKind {
	return (BAG_KINDS as readonly string[]).includes(value);
}

/** The intake movement a bag of this kind produces when it closes. */
export function intakeKindFor(bag: BagKind): MovementKind {
	return bag === "donated" ? "intake_donated" : "intake_purchased";
}

export const BAG_STATUSES = ["open", "closed"] as const;
export type BagStatus = (typeof BAG_STATUSES)[number];

/** The unique key of a slot: one row per distinct combination. */
export function slotKey(
	category_id: bigint,
	size_id: bigint,
	gender_id: bigint,
	condition_id: bigint,
): string {
	return `${category_id}:${size_id}:${gender_id}:${condition_id}`;
}

/** A label is trimmed and non-empty; that is the whole rule. */
export function normalizeLabel(label: string): string {
	return label.trim();
}

// ---------------------------------------------------------------------------
// Seeds. Sort orders step by 10 so a row can be slotted between two others
// without renumbering. Labels are what volunteers see and can be edited;
// scale keys are stable.
// ---------------------------------------------------------------------------

export interface SeedScale {
	key: string;
	label: string;
	sizes: readonly string[];
}

export const SEED_SCALES: readonly SeedScale[] = [
	{
		key: "clothing",
		label: "Clothing",
		sizes: [
			"Preemie",
			"Newborn",
			"0-3m",
			"3-6m",
			"6-9m",
			"9-12m",
			"12m",
			"18m",
			"24m",
			"2T",
			"3T",
			"4T",
			"5",
			"6",
			"7",
			"8",
			"10",
			"12",
			"14",
			"16",
			"18",
			"Youth S",
			"Youth M",
			"Youth L",
			"Youth XL",
		],
	},
	{
		key: "shoes",
		label: "Shoes",
		sizes: [
			"Infant 1",
			"Infant 2",
			"Infant 3",
			"Infant 4",
			"Toddler 5",
			"Toddler 6",
			"Toddler 7",
			"Toddler 8",
			"Toddler 9",
			"Toddler 10",
			"Kids 11",
			"Kids 12",
			"Kids 13",
			"Youth 1",
			"Youth 2",
			"Youth 3",
			"Youth 4",
			"Youth 5",
			"Youth 6",
			"Youth 7",
		],
	},
	{
		key: "diapers",
		label: "Diapers",
		sizes: [
			"Newborn",
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"Pull-up 2T-3T",
			"Pull-up 3T-4T",
			"Pull-up 4T-5T",
		],
	},
];

export interface SeedCategory {
	label: string;
	/** Key of the scale in SEED_SCALES. */
	scale: string;
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
	{ label: "Tops", scale: "clothing" },
	{ label: "Bottoms", scale: "clothing" },
	{ label: "Dresses", scale: "clothing" },
	{ label: "Outerwear", scale: "clothing" },
	{ label: "Pajamas", scale: "clothing" },
	{ label: "Underwear", scale: "clothing" },
	{ label: "Socks", scale: "clothing" },
	{ label: "Shoes", scale: "shoes" },
	{ label: "Diapers", scale: "diapers" },
];

export const SEED_GENDERS: readonly string[] = ["Boys", "Girls", "Neutral"];

export interface SeedCondition {
	label: string;
	/** Whether items in this condition go on the shelves at all. */
	shelved: boolean;
}

export const SEED_CONDITIONS: readonly SeedCondition[] = [
	{ label: "New", shelved: true },
	{ label: "Good", shelved: true },
	{ label: "Worn", shelved: false },
];

export const SEED_LOCATIONS: readonly string[] = ["Shelves", "Door"];

/** Sort order for the nth seeded row. */
export function seedSortOrder(index: number): number {
	return (index + 1) * 10;
}
