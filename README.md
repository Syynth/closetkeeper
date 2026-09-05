# Closetkeeper

Inventory and administration software for a nonprofit clothing closet serving
families in Klamath County, Oregon. The org collects donated children's
clothing, connects with schools to reach families in need, and distributes by
one-on-one appointment rather than storefront.

## Status

**Phase 1 — internal admin only.** Nothing here is public-facing yet. The
repository is scaffolding at this point; the module and web app are not built.

## Stack

| Layer | Choice |
|---|---|
| Backend | SpacetimeDB module, written in TypeScript |
| Hosting | SpacetimeDB Maincloud |
| Auth | SpacetimeDB built-in identity (to start) |
| Frontend | React Router v7 on Cloudflare Workers |

## Requirements

| Tool | Version |
|---|---|
| Node | see [`.nvmrc`](.nvmrc) |
| pnpm | 12+ |
| SpacetimeDB CLI | 2.10+ |

Install the SpacetimeDB CLI from [spacetimedb.com/install](https://spacetimedb.com/install).

## Layout

| Path | What |
|---|---|
| `spacetimedb/` | The SpacetimeDB module (TypeScript). All writes go through its reducers. |
| `apps/admin/` | Staff/volunteer admin SPA. Vite, React, TanStack Router, served from Cloudflare Workers static assets. |
| `apps/public/` | Reserved for the phase-2 public site. Nothing here yet. |
| `packages/bindings/` | Client bindings generated from the module by `spacetime generate`. Committed, so schema changes show up in review. |
| `docs/` | Decision log and vendored SpacetimeDB reference material. |

## Getting started

```bash
pnpm install
```

Copy `apps/admin/.env.example` to `apps/admin/.env.local`. The defaults point
at a local database; the commented lines point at the Maincloud dev database.

Run a local SpacetimeDB in one terminal, publish the module to it, and invite
yourself. Whoever publishes is the first staff member, so the invite is
authorized:

```bash
pnpm module:local
```

```bash
pnpm module:publish:local
```

```bash
spacetime call closetkeeper-local --server local invite_staff '"you@example.org"' '"Your Name"' '"staff"' --no-config
```

Then start the admin app on [http://localhost:7070](http://localhost:7070)
and log in with that email. The magic link comes from SpacetimeAuth; the
local instance validates the token against SpacetimeAuth's published keys, so
it needs internet access.

```bash
pnpm admin:dev
```

The local database is in-memory and disappears when `pnpm module:local`
stops, so the publish and invite are repeated each session.

## Checks

Everything CI runs, in the order it runs it:

```bash
pnpm lint && pnpm typecheck && pnpm module:build && pnpm admin:build && pnpm test
```

Module tests are integration tests: they publish the module to the local
instance started by `pnpm module:local` and inspect the result, so that
instance must be running. There is no mock of the database. The schema
guardrail test fails if any table is public that is not explicitly allowlisted
in [`spacetimedb/test/schema-guardrail.test.ts`](spacetimedb/test/schema-guardrail.test.ts).

## Deploying

Everything deploys from CI; nothing is deployed from a terminal.

| What | When | Where |
|---|---|---|
| Module | merge to `main` touching `spacetimedb/` | `closetkeeper-dev` on Maincloud |
| Module | push a `v*` tag | `closetkeeper` (production) on Maincloud |
| Admin app | pull request | preview version on the `closetkeeper-admin-dev` Worker, URL commented on the PR |
| Admin app | merge to `main` | `closetkeeper-admin-dev` Worker, pointed at `closetkeeper-dev` |
| Admin app | push a `v*` tag | `closetkeeper-admin` Worker, pointed at `closetkeeper` |

Module and admin share triggers so they reach production together. Every
deployed admin origin (plus `/callback`) must be listed as a redirect URI on
the SpacetimeAuth client, or login there fails; previews use one stable alias
(`preview-closetkeeper-admin-dev…`) so that registration happens once.

To release the module to production, tag the commit on `main`:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

### Secrets and one-time setup

| Where | Name | What |
|---|---|---|
| GitHub environments `dev` and `prod` | `SPACETIMEDB_TOKEN` | Token for the identity that publishes. `spacetime login show --token`. |
| GitHub repository secret | `BOOTSTRAP_STAFF_EMAIL` | Optional. Invited as the first real staff member after every publish. |
| GitHub repository secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Token from the "Edit Cloudflare Workers" template. Deploys the admin app. |
| `spacetimedb/src/config.ts` | `TRUSTED_CLIENT_IDS` | The SpacetimeAuth client ID(s). Not secret; committed. |

Whoever publishes a database first is seeded as its first staff member.
Browser logins can only link to staff once the SpacetimeAuth project exists
and its client ID is in `TRUSTED_CLIENT_IDS`.

**Production never receives `--delete-data`.** A schema change that would
require a migration or destroy rows makes the CLI abort the publish
non-interactively (verified; see the decision log), so the production job
fails and leaves the data alone. When that happens, the change needs a
deliberate migration, not the flag. The dev database holds no real data and
wipes itself on conflict instead.

## License

[Apache-2.0](LICENSE).

## Before contributing

Read [`CLAUDE.md`](CLAUDE.md). It documents non-negotiable privacy and safety
constraints around family data that are not obvious from the code, and are not
optional.
