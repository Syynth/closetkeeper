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

## Getting started

Not yet scaffolded — setup instructions land here once the module and web app
exist.

## License

[Apache-2.0](LICENSE).

## Before contributing

Read [`CLAUDE.md`](CLAUDE.md). It documents non-negotiable privacy and safety
constraints around family data that are not obvious from the code, and are not
optional.
