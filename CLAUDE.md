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
   `log::info!` or equivalent. Log identifiers, not people.
5. **Aggregate counts published publicly must be suppressed below a threshold**
   of 3, and never broken down by school or neighborhood. In a county this size
   a specific count can identify a specific child.

## Stack

- **Backend:** SpacetimeDB module written in **TypeScript**, deployed to
  **Maincloud**. All writes go through reducers. The whole stack is one
  language and one toolchain — module, generated bindings, admin client, and
  Worker — so there is no second runtime to context-switch into.
- **Frontend:** React Router v7 (framework mode), deployed to Cloudflare Workers
  with static assets. Not Cloudflare Pages — Workers is the current
  recommendation for new projects and has feature parity plus Durable Objects,
  Cron Triggers, and Secrets Store.
- **Admin UI:** client-side only, direct WebSocket connection to SpacetimeDB.
  No SSR for admin routes.
- **Public pages:** SSR, rendered from a KV snapshot. Never query SpacetimeDB
  per visitor request.

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

- **Provider: SpacetimeDB's built-in identity, to start.** A third-party OIDC
  provider may replace it later; everything below is written to survive that
  swap. Details of the validation below are still under design — do not treat
  the specifics as settled.
- **Anyone can obtain a valid SpacetimeDB identity.** With the built-in
  provider there is no signup gate we control, so authentication proves only
  that a caller is *someone*, not that they are *ours*. The `staff_member`
  allowlist therefore carries the entire authorization burden. Treat a missing
  allowlist check as a data breach, not a bug.
- In `client_connected`, validate the JWT `iss` matches our issuer and the `aud`
  claim matches our client ID. Without this, a token from any unrelated OIDC
  provider authenticates fine.
- Every admin reducer returns `Err` unless the caller resolves to a
  `staff_member` row. Allowlist, never blocklist.
- The first staff identity is bootstrapped manually.

### Roles

| Role      | Inventory | Donation intake | Requests / families | Financial |
|-----------|-----------|-----------------|---------------------|-----------|
| volunteer | yes       | yes             | **no**              | no        |
| staff     | yes       | yes             | yes                 | no        |
| treasurer | read      | read            | **no**              | read      |

Volunteers are often community members who know the families personally. The
restriction is what lets the org recruit help without asking families to accept
that neighbors will see their names.

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
  port. Tunnel over SSH.
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
