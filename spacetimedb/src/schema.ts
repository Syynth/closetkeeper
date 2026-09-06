import { ScheduleAt, Timestamp } from "spacetimedb";
import { schema, t, table } from "spacetimedb/server";

/**
 * Tables. Every table is private unless `public: true` is stated here AND the
 * table is allowlisted in test/schema-guardrail.test.ts with a reason.
 *
 * Migration rules (docs/decision-log.md, "Production module publishes"):
 * columns can be appended with a default, never removed, renamed, retyped, or
 * reordered once real data exists. Get names and types right the first time.
 *
 * Vocabulary: a `person` is the account. An `auth_provider_link` is one way
 * that person can log in. Not to be confused with a SpacetimeDB connection
 * (`ctx.connectionId`), which is a live WebSocket session and is never stored.
 */

/**
 * A human. Families, donors, staff, and volunteers are all people. Most will
 * never log in. Nothing about a person implies they can.
 */
const person = table(
	{ name: "person" },
	{
		id: t.u64().primaryKey().autoInc(),
		display_name: t.string(),
		/** Lowercased, trimmed. Empty string when unknown; never null, so it can be indexed. */
		email: t.string().index(),
		notes: t.string(),
		created_at: t.timestamp(),
	},
);

/**
 * One configured way for a person to log in: a magic-link email today, a
 * Google login later. Each provider's `issuer + subject` derives a distinct
 * SpacetimeDB Identity, so a person with two providers has two rows. Identity
 * is a unique column, never the primary key, so changing providers never
 * rewrites a foreign key.
 *
 * `issuer` and `subject` are empty for the row seeded from the publisher's
 * CLI identity, which carries no OIDC claims.
 */
const auth_provider_link = table(
	{ name: "auth_provider_link" },
	{
		id: t.u64().primaryKey().autoInc(),
		identity: t.identity().unique(),
		issuer: t.string(),
		subject: t.string(),
		person_id: t.u64().index(),
		created_at: t.timestamp(),
		last_seen_at: t.timestamp(),
	},
);

/**
 * A named bundle of capabilities. Rows, not code, so the org can shape roles
 * without a republish. `key` is a stable machine name and never changes;
 * `label` is what people see. System roles are seeded by init and cannot be
 * deleted. Capabilities themselves are code (auth-rules.ts).
 */
const role = table(
	{ name: "role" },
	{
		id: t.u64().primaryKey().autoInc(),
		key: t.string().unique(),
		label: t.string(),
		description: t.string(),
		system: t.bool(),
		created_at: t.timestamp(),
	},
);

/** One capability held by one role. */
const role_capability = table(
	{ name: "role_capability" },
	{
		id: t.u64().primaryKey().autoInc(),
		role_id: t.u64().index(),
		capability: t.string(),
	},
);

/**
 * The authorization allowlist. A person is staff iff they have an active row
 * here. `invited_by` is 0 for the row seeded by the module itself.
 */
const staff_member = table(
	{ name: "staff_member" },
	{
		id: t.u64().primaryKey().autoInc(),
		person_id: t.u64().unique(),
		role_id: t.u64().index(),
		active: t.bool(),
		invited_at: t.timestamp(),
		invited_by: t.u64(),
		/**
		 * When the person finished their first-visit welcome; epoch 0 until
		 * then. Appended with a default so existing rows migrate in place.
		 */
		welcomed_at: t.timestamp().default(new Timestamp(0n)),
	},
);

/**
 * Who did what. Written by construction: every admin reducer goes through
 * defineAdminReducer (admin-reducer.ts), which inserts one row per
 * successful call. Append-only for everyone, super-admins included: no
 * reducer edits or deletes these rows, and none may be added.
 *
 * `details` is a JSON object of the reducer's arguments minus redacted
 * (personal) fields, plus whatever the reducer adds. Never names, emails,
 * phone numbers, or addresses.
 */
const audit_event = table(
	{ name: "audit_event" },
	{
		id: t.u64().primaryKey().autoInc(),
		at: t.timestamp().index(),
		/** 0 for the module itself (init, scheduled reducers). */
		actor_staff_id: t.u64().index(),
		/** The reducer name, e.g. "invite_staff". A closed vocabulary by construction. */
		action: t.string().index(),
		target_table: t.string(),
		target_id: t.u64(),
		details: t.string(),
	},
);

/**
 * Who is trying to get in. One row per connection, whatever the outcome,
 * written by clientConnected. Doubles as staff login history. Unlike the
 * audit log, these rows are purged after ACCESS_EVENT_RETENTION_DAYS.
 *
 * The module cannot see IP addresses; the host does not expose transport
 * details to reducers. `email` is set only for a trusted token, and is the
 * one personal field here: it is what makes "someone tried to get in"
 * actionable. It is purged with the row and shown only to super-admins.
 */
const access_event = table(
	{ name: "access_event" },
	{
		id: t.u64().primaryKey().autoInc(),
		at: t.timestamp().index(),
		identity: t.identity().index(),
		connection_id: t.string(),
		issuer: t.string(),
		subject: t.string(),
		email: t.string(),
		/** One of ACCESS_OUTCOMES in auth-rules.ts. */
		outcome: t.string().index(),
	},
);

/** Drives the daily access-event purge. One row, inserted by init. */
const access_event_purge_schedule = table(
	{
		name: "access_event_purge_schedule",
		// biome-ignore lint/suspicious/noExplicitAny: the SDK's documented pattern for the forward reference
		scheduled: (): any => purgeAccessEvents,
	},
	{
		scheduled_id: t.u64().primaryKey().autoInc(),
		scheduled_at: t.scheduleAt(),
	},
);

// ---------------------------------------------------------------------------
// Inventory. See docs/design/inventory.md. Vocabularies are rows; the spine
// is `slot`; counts are a ledger plus a per-slot cache; intake is a bag.
// None of these tables hold family data, but they stay private like the
// rest and are read through views.
// ---------------------------------------------------------------------------

/** A sizing system: clothing, shoes, diapers. Rarely edited; `key` never changes. */
const scale = table(
	{ name: "scale" },
	{
		id: t.u64().primaryKey().autoInc(),
		key: t.string().unique(),
		label: t.string(),
	},
);

/** One size on one scale. Closed vocabulary: intake never accepts free text. */
const size = table(
	{ name: "size" },
	{
		id: t.u64().primaryKey().autoInc(),
		scale_id: t.u64().index(),
		label: t.string(),
		sort_order: t.u32(),
		active: t.bool(),
	},
);

/** A kind of garment. Each category uses exactly one size scale. */
const category = table(
	{ name: "category" },
	{
		id: t.u64().primaryKey().autoInc(),
		label: t.string(),
		scale_id: t.u64().index(),
		sort_order: t.u32(),
		active: t.bool(),
	},
);

/** Boys, girls, neutral. A vocabulary because requests and shelves both use it. */
const gender = table(
	{ name: "gender" },
	{
		id: t.u64().primaryKey().autoInc(),
		label: t.string(),
		sort_order: t.u32(),
		active: t.bool(),
	},
);

/**
 * New, good, worn. `shelved: false` conditions are counted at intake for
 * reporting but never appear on the shelves: they went to recycling.
 */
const condition = table(
	{ name: "condition" },
	{
		id: t.u64().primaryKey().autoInc(),
		label: t.string(),
		sort_order: t.u32(),
		active: t.bool(),
		shelved: t.bool(),
	},
);

/**
 * Where labeled items are: shelves, a bin, the door. `label_code` is the
 * code a sticker on the bin carries; empty until labels exist (step 2).
 */
const location = table(
	{ name: "location" },
	{
		id: t.u64().primaryKey().autoInc(),
		label: t.string(),
		label_code: t.string(),
		sort_order: t.u32(),
		active: t.bool(),
	},
);

/**
 * The spine: one row per distinct category × size × gender × condition
 * that has ever been counted. Created lazily, never pre-generated. `key`
 * is the four ids joined (inventory-rules.ts, slotKey) and is unique.
 */
const slot = table(
	{ name: "slot" },
	{
		id: t.u64().primaryKey().autoInc(),
		key: t.string().unique(),
		category_id: t.u64().index(),
		size_id: t.u64(),
		gender_id: t.u64(),
		condition_id: t.u64(),
	},
);

/** The slot's total. Written only by the movement helper; a test asserts it equals the ledger. */
const stock_level = table(
	{ name: "stock_level" },
	{
		slot_id: t.u64().primaryKey(),
		on_hand: t.i32(),
	},
);

/**
 * The same count broken down by where it physically is. Location is a
 * breakdown *inside* a slot, never a fifth dimension of the slot itself, so
 * the slot stays the reporting spine and a bin that is renamed or retired
 * never splits a category's history. `key` is `slot_id:location_id`.
 */
const stock_bin_level = table(
	{ name: "stock_bin_level" },
	{
		key: t.string().primaryKey(),
		slot_id: t.u64().index(),
		location_id: t.u64().index(),
		on_hand: t.i32(),
	},
);

/**
 * Append-only ledger of every change to a count. `kind` is one of
 * MOVEMENT_KINDS. `bag_line_id` and `item_id` are 0 when not applicable.
 * Grant reporting is a query over this table.
 */
const stock_movement = table(
	{ name: "stock_movement" },
	{
		id: t.u64().primaryKey().autoInc(),
		slot_id: t.u64().index(),
		delta: t.i32(),
		kind: t.string().index(),
		at: t.timestamp(),
		staff_id: t.u64(),
		bag_line_id: t.u64(),
		item_id: t.u64(),
		/** Free text; may name a donor, so it is redacted from audit details. */
		note: t.string(),
		/**
		 * Which bin it came out of or went into. Appended with a default, so
		 * existing rows migrate in place; 0 means the movement predates bins.
		 */
		location_id: t.u64().default(0n),
	},
);

/**
 * One intake session: a donation or a purchase. Lines are added while it is
 * open; closing writes the movements and locks it. `donor_person_id` is 0
 * until donors are modeled; it is here so the receipt has somewhere to hang.
 */
const bag = table(
	{ name: "bag" },
	{
		id: t.u64().primaryKey().autoInc(),
		kind: t.string(),
		status: t.string().index(),
		opened_at: t.timestamp(),
		opened_by: t.u64(),
		closed_at: t.timestamp(),
		closed_by: t.u64(),
		donor_person_id: t.u64(),
		note: t.string(),
	},
);

/** One count of one slot in one bag. */
const bag_line = table(
	{ name: "bag_line" },
	{
		id: t.u64().primaryKey().autoInc(),
		bag_id: t.u64().index(),
		slot_id: t.u64().index(),
		count: t.u32(),
		created_at: t.timestamp(),
		created_by: t.u64(),
		/** Where this line is headed. Appended with a default. */
		location_id: t.u64().default(0n),
	},
);

const spacetimedb = schema({
	person,
	auth_provider_link,
	role,
	role_capability,
	staff_member,
	audit_event,
	access_event,
	access_event_purge_schedule,
	scale,
	size,
	category,
	gender,
	condition,
	location,
	slot,
	stock_level,
	stock_bin_level,
	stock_movement,
	bag,
	bag_line,
});

export default spacetimedb;

const MICROS_PER_DAY = 86_400_000_000n;
/** Access events older than this are purged. Audit events never are. */
export const ACCESS_EVENT_RETENTION_DAYS = 90n;
/** How often the purge runs. */
export const ACCESS_EVENT_PURGE_INTERVAL = ScheduleAt.interval(MICROS_PER_DAY);

/**
 * Scheduled, not staff-driven, so it is not an admin reducer: the caller is
 * the database itself, which is checked. Deletes access events older than
 * the retention window. Listed on the reducer guardrail's allowlist.
 */
export const purgeAccessEvents = spacetimedb.reducer(
	{ name: "purge_access_events" },
	{ schedule: access_event_purge_schedule.rowType },
	(ctx) => {
		if (!ctx.sender.isEqual(ctx.databaseIdentity)) {
			throw new Error("purge_access_events may only be run by the scheduler");
		}
		const cutoff =
			ctx.timestamp.microsSinceUnixEpoch -
			ACCESS_EVENT_RETENTION_DAYS * MICROS_PER_DAY;
		for (const row of [...ctx.db.access_event.iter()]) {
			if (row.at.microsSinceUnixEpoch < cutoff) ctx.db.access_event.delete(row);
		}
	},
);
