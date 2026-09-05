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

Run a local SpacetimeDB in one terminal and the admin app in another:

```bash
pnpm module:local
```

```bash
pnpm admin:dev
```

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
| Admin app | merge to `main`, and a preview per pull request | Cloudflare Workers Builds |

To release the module to production, tag the commit on `main`:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

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
