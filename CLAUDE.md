# Closetkeeper

Inventory and administration software for a nonprofit clothing closet serving
families in Klamath County, Oregon. The org collects donated children's
clothing, connects with schools to reach families in need, and distributes by
one-on-one appointment rather than storefront.

This is a small operation: a garage-scale closet, a handful of staff and
volunteers, and appointments measured in the dozens per month. Optimize for
clarity and low maintenance burden, not throughput.

## Non-negotiable constraints

These exist for legal and safety reasons. Do not relax them without an explicit
decision from the maintainer.

1. **Family data is never public.** Tables containing `person` records,
   requests, or appointments are private. Never mark them `public`. Never expose
   them through an HTTP handler or an unauthenticated path.
2. **Volunteers cannot see request or family data.** Role separation is a
   privacy feature, not a convenience. See Roles below.
3. **No payment card data, ever.** The app does not process payments. Financial
   records live in the donation platform and QuickBooks, not here.
4. **No PII in logs.** No names, phone numbers, addresses, or emails in
   `console.info` or equivalent. Log identifiers, not people.
5. **Aggregate counts published publicly must be suppressed below a threshold**
   of 3, and never broken down by school or neighborhood. In a county this size
   a specific count can identify a specific child.

## What in this document is actually settled

This file began as notes from a brainstorming session and was wrong on first
contact more than once — it called for a Rust module, and named a React
Router version two majors behind. It has since been corrected as decisions
were made. Every decision below has a dated entry with its reasoning in
[`docs/decision-log.md`](docs/decision-log.md); when this file and the log
disagree, the more recent one wins and the other gets fixed.

**Settled.** SpacetimeDB as the backend, on Maincloud. Mantine as the UI
library. Cloudflare Workers as
the hosting platform, deployed from GitHub Actions. TypeScript everywhere,
including the module. React with TanStack Router for the admin SPA, with
TanStack Start reserved for the public site. SpacetimeAuth (magic link) for
staff login, with authorization entirely in the module's allowlist. Vitest,
with module tests as integration tests against a local instance rather than
a mock, plus a schema guardrail. Biome for lint and format. Public repository
under Apache-2.0, changes via pull request with CI required. Production
releases on `v*` tags. The non-negotiable constraints above, the roles table,
and the data model principles.

**Deliberately deferred.** Whether admin and public ship as one Worker
(TanStack Start with selective SSR, `/admin` subtree client-only) or two
Workers (static-asset admin SPA + a separate SSR/cron Worker). The admin app
is built standalone under `apps/admin` so either shape remains possible.
Decide when phase 2 begins, not before.

**Not settled.** Any specific version number appearing anywhere in this
document — everything runs latest, see below.

A choice appearing in this file is not evidence it was decided. If it is in
the "not settled" list, ask rather than assume.

## Stack

- **Backend:** SpacetimeDB module written in **TypeScript**, deployed to
  **Maincloud**. All writes go through reducers. The whole stack is one
  language and one toolchain — module, generated bindings, admin client, and
  Worker — so there is no second runtime to context-switch into.
- **Frontend:** React with TanStack Router, built with Vite, deployed to
  Cloudflare Workers as static assets from GitHub Actions (not Cloudflare
  Pages, and not Workers Builds — see Environments below). The admin Worker
  has no `main`: it serves files and nothing else, so it has no server-side
  attack surface. TanStack was chosen over React Router because Cloudflare's
  React Router integration does not support SPA mode, while TanStack supports
  per-route `ssr: false` — the only option that can serve a client-only admin
  and an SSR public site from one codebase.
- **SpacetimeDB client:** the official `spacetimedb/react` hooks
  (`SpacetimeDBProvider`, `useTable`, `useReducer`), or `spacetimedb/tanstack`
  if react-query is adopted. Generated bindings live in `packages/bindings`
  and are committed, so schema changes are visible in review. The admin
  connects only after sign-in, with the OIDC ID token; there is no anonymous
  connection in the admin app.
- **Admin UI:** client-side only, direct WebSocket connection to SpacetimeDB.
  No SSR for admin routes.
- **Public pages:** SSR, rendered from a KV snapshot. Never query SpacetimeDB
  per visitor request.

General SpacetimeDB reference material — reducer semantics, determinism rules,
client subscription patterns — lives in [`docs/spacetimedb-guide.md`](docs/spacetimedb-guide.md),
copied from the CLI template. It is upstream documentation, not project policy.
Where the two disagree, this file wins.

## Environments and deployment

Nothing is deployed from a terminal. Module and admin share triggers so they
reach production together.

| Trigger | Module (Maincloud) | Admin (Cloudflare Worker) |
|---|---|---|
| pull request | — | preview version, alias `preview`, URL commented on the PR |
| merge to `main` | `closetkeeper-dev` | `closetkeeper-admin-dev` → dev database |
| push `v*` tag | `closetkeeper` (production) | `closetkeeper-admin` → production database |
| local | `closetkeeper-local` on `spacetime start --in-memory` | `pnpm admin:dev` on port 7070 |

- **Production never receives `--delete-data`.** The CLI refuses a
  non-interactive publish that would require a migration or destroy rows
  unless that flag is passed (verified), so an incompatible schema change
  fails the job and leaves data alone. Handle it with an incremental
  migration, never by adding the flag. Dev wipes itself on conflict instead.
- **`init` runs once per database.** Anything it seeds is missing from a
  database created before the seed existed; that database must be recreated.
- **Every deployed admin origin** must be a registered redirect URI on the
  SpacetimeAuth client, plus `/callback`, or login there fails. Previews use
  one stable alias so that registration happens once.
- **Secrets** live in GitHub (environments `dev` and `prod`, plus repository
  level) and nowhere in the tree. The README lists them. A module cannot
  read environment variables; nothing secret can ever be in module code.
- The local database is in-memory and disappears with the process, so the
  local publish and self-invite are repeated each session (see README).

## Dependency policy

**Everything runs on the latest version available.** Node, pnpm, the
SpacetimeDB CLI, TypeScript, and every package. This is deliberate: a small
project that falls behind gradually becomes a project nobody can upgrade,
and the maintainer would rather absorb small breakages continuously than one
large one in two years.

**Downgrades require explicit maintainer sign-off.** If a dependency forces
an older version of something else, do not quietly pin backwards. Surface the
conflict, name what breaks, and ask. Prefer a different tool that works at
current versions over a downgrade.

## Phasing

Phase 1 (current): internal admin only — inventory, donation intake, requests,
appointments, staff/volunteer accounts.

Phase 2 (later): public-facing request form, donation-needs page, appointment
self-scheduling.

Do not build phase 2 surfaces early. SpacetimeDB row-level security is still
marked experimental and unstable; phase 1 avoids depending on it by keeping all
sensitive tables private and admin-only.

## Data model principles

**Vocabularies are rows, not enums.** Categories, sizes, request statuses, and
conditions live in tables with an admin UI to add entries. Adding "youth XL"
must be a reducer call, not a module republish and schema migration. This is the
single most important thing keeping the org unblocked when the maintainer is
unavailable.

**Sizes use a closed vocabulary.** Never accept free-text sizes. Kids' sizing is
chaotic ("8", "8-10", "youth M", "size 9") and free text destroys the gap
analysis within weeks. Dropdown only, sourced from the size table.

**Category × size is the spine.** Inventory counts and open requests both roll
up to a `category_size` row. The gap report is on-hand minus open requests,
grouped by that spine. This drives both purchasing and donation asks.

**Personhood is separate from identity.** Most families and donors will never
log in — they phone, or drop off a bag at a fundraiser.

```
person        — the human record; name, contact, notes. No auth required.
account       — OIDC identity (iss+sub), links to at most one person. Optional.
staff_member  — person_id + role. This is the authorization allowlist.
```

Requests, donations, and appointments hang off `person_id`, never off an
identity. A phone-call intake and a self-service signup must produce identical
records.

**Never use SpacetimeDB `Identity` as a primary key.** Identity is derived from
`iss` + `sub`, so changing OIDC providers changes every identity. Store it as a
linked field on `account`.

**Track donated vs purchased at intake.** In-kind donations and purchases follow
different bookkeeping paths and the distinction is miserable to backfill.

**Expect duplicate people.** The same family calls in March and again in
September with a different spelling. Build `merge_person` early, before
duplicates accumulate references across four tables.

## Auth and authorization

SpacetimeDB modules are exposed to the open internet and anyone can connect. A
client with no token gets a fresh anonymous identity. Authentication gives you a
stable identity and **no authorization whatsoever**.

- **Provider: SpacetimeAuth (`https://auth.spacetimedb.com/oidc`), magic
  link only to start.** More providers (Google, etc.) can be enabled in the
  SpacetimeAuth project later without a schema change: each provider login
  is one more `auth_provider_link` row for the same person.
- **Anyone can obtain a valid SpacetimeDB identity.** Authentication proves
  only that a caller is *someone*, not that they are *ours*. The
  `staff_member` allowlist carries the entire authorization burden. Treat a
  missing allowlist check as a data breach, not a bug.
- **Connecting grants nothing.** `clientConnected` records the visit and, if
  the token is trusted and its verified email matches a person with an
  active staff row, links the identity to that person. It never rejects,
  because the CLI and the test harness connect with non-SpacetimeAuth
  identities. See `spacetimedb/src/auth.ts`.
- **Every admin reducer starts with `requireStaff(ctx, capability)`** from
  `src/auth.ts`, which resolves `ctx.sender` → `auth_provider_link` →
  `staff_member` and checks the role's capabilities (`src/auth-rules.ts`).
  Allowlist, never blocklist. A trusted token must carry our issuer and one
  of our client IDs in `aud` (`src/config.ts`), so a token minted for some
  other application can never resolve to staff.
- **Bootstrap:** `init` seeds the publisher's identity as the first staff
  member (in `init`, `ctx.sender` is whoever published). No email or name is
  in the module. CI then invites the address in the `BOOTSTRAP_STAFF_EMAIL`
  repository secret, so another deployer seeds their own person without
  touching code. `init` runs once per database; a database created before
  the seed existed must be recreated.
- **Roles are code, not rows.** Their meaning is enforced by code paths, so
  a table would only add a place for the two to drift.

### Roles

Roles are rows (`role`, `role_capability`), seeded by `init` and adjustable
by a super-admin without a republish. Capabilities are code
(`spacetimedb/src/auth-rules.ts`). Seeded roles:

| Role        | Inventory | Donations | Families | Financial | Staff mgmt |
|-------------|-----------|-----------|----------|-----------|------------|
| super_admin | yes       | yes       | yes      | yes       | yes, incl. protected |
| president   | yes       | yes       | yes      | yes       | yes, incl. protected |
| staff       | yes       | yes       | yes      | no        | yes        |
| secretary   | yes       | yes       | yes      | no        | yes        |
| treasurer   | yes       | yes       | yes      | read      | no         |
| volunteer   | yes       | yes       | **no**   | no        | no         |

Family data and role management are **protected capabilities**: only a
holder of `staff.manage_sensitive` (super_admin, president) can grant them
or place someone in a role that has them. Volunteers are often community
members who know the families personally. The restriction is what lets the
org recruit help without asking families to accept that neighbors will see
their names. A `director` role (same as staff) is deferred until needed.

## Public snapshot pipeline

A Cloudflare Cron Trigger runs on a **deliberately slow cadence** (daily or
weekly, not minutes), authenticates with an admin token, queries the private
tables via SpacetimeDB's `POST /v1/database/:name/sql` HTTP endpoint, applies
suppression, and writes a JSON summary to Workers KV. Public SSR reads only KV.

Two reasons for the slow cadence: the public site stays up if the database is
down or mid-republish, and nobody can difference successive snapshots to watch
individual requests arrive in real time.

Suppression logic belongs in the cron job or a reducer — never in the template.

## Operational requirements

- **Export reducer, maintained from day one.** CSV export of inventory,
  donations, and requests. `pg_dump` will not work: SpacetimeDB's PGWire support
  omits Postgres-compatible system catalogs, and only protocol 3.0 simple query
  mode without parameterized queries is supported. Per-table `\copy` or an
  export reducer is the path.
- **Backups off the host, tested by actually restoring once.**
- **Never expose the PGWire port beyond localhost on self-hosted deployments.**
  SSL is only supported on SpacetimeDB Cloud; Standalone has no TLS on that
  port. Tunnel over SSH. (Not currently applicable: production is Maincloud.
  Kept in case that ever changes.)
- **Maincloud Free pauses a database after a week idle.** What that looks
  like to a volunteer opening the app after a holiday is untested and must
  be, before launch, on `closetkeeper-dev`.
- **Retention policy.** Purge or anonymize family records a fixed interval after
  their last appointment. Every field not retained is a field that can't leak.

## Donation and financial handling

- Payments go through a hosted platform (Givebutter, Zeffy, or Stripe Checkout).
  This app never touches card data.
- Store at most `person_id ↔ external_donor_id`. No amounts, no financial
  records in SpacetimeDB.
- QuickBooks is the book of record for cash. Closetkeeper is the book of record
  for goods. Export CSV for the treasurer; do not build a QuickBooks API
  integration.
- **Donor receipts describe items, never dollar values.** Valuation is the
  donor's responsibility. Date, donor, item description, and a statement about
  goods or services provided.
- **The org's own books do record fair value for in-kind goods** — separately
  from the receipt. Staff enter an estimate using one documented method
  (Goodwill or Salvation Army valuation guide), applied consistently. Auditors
  and grant funders ask about methodology.

## Code conventions

- All writes through reducers. No direct table mutation from clients.
- **Every admin reducer is declared with `defineAdminReducer`** from
  `spacetimedb/src/admin-reducer.ts`, which applies `requireStaff` for the
  declared capability and writes the audit row. Never call
  `spacetimedb.reducer` directly for anything a client can invoke; the
  reducer guardrail test fails CI if you do. Arguments that are personal
  (emails, names) go in `redact`.
- **Tables are private unless allowlisted** in
  `spacetimedb/test/schema-guardrail.test.ts` with a reason. The guardrail
  fails CI otherwise. Clients see a private table's rows only through a
  per-user view (see `my_staff`) that returns exactly the caller's own data.
- **Schema changes are near-permanent once real data exists.** Only appending
  a column with a default is an automatic migration. Get names and types
  right the first time; every new column gets a default. See
  `docs/decision-log.md`, "Production module publishes".
- Table names are `snake_case`; generated client bindings expose them as
  `camelCase` (`tables.myStaff`, `row.personId`). Reducer names are
  `snake_case` in the database (`invite_staff` for `inviteStaff`).
- **Regenerate bindings after any schema change** with `pnpm bindings` and
  commit the result. CI fails if they are stale. A table appearing in the
  bindings diff means it became public; that is what review is for.
- Pure logic that needs no `ctx.db` lives in files that import nothing from
  `spacetimedb/server` at runtime (type-only imports are fine), so Vitest can
  test it without a host. See `spacetimedb/src/auth-rules.ts`.
- Reducers give an audit trail nearly for free — preserve it; it becomes the
  impact reporting for grant applications.
- Mobile-first intake UI. The primary use is standing in a garage holding a bag
  of clothes: large tap targets, category-size-count in three taps, no keyboard.
- Prefer boring and obvious. This will be edited at 10pm eighteen months from
  now with no context loaded.

## Things deliberately not built

- Item-level SKU tracking of individual garments. Counts by category and size
  only. Per-garment tracking is what kills volunteer adoption within a month.
- Family login as a prerequisite for requesting help. The public request form
  works with no account; accounts are optional and added later via magic link.
- Server-side subscriptions. Cloudflare Workers cannot hold long-lived outbound
  WebSockets. Anything reactive belongs in the browser.
