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
 * The authorization allowlist. A person is staff iff they have an active row
 * here. Role semantics live in code (src/auth-rules.ts), not in a table.
 * `invited_by` is 0 for the row seeded by the module itself.
 */
const staff_member = table(
	{ name: "staff_member" },
	{
		id: t.u64().primaryKey().autoInc(),
		person_id: t.u64().unique(),
		role: t.string(),
		active: t.bool(),
		invited_at: t.timestamp(),
		invited_by: t.u64(),
	},
);

const spacetimedb = schema({ person, auth_provider_link, staff_member });

export default spacetimedb;
