# Decision log

Decisions made by the maintainer during development, captured so the reasoning
is not lost. This is a data-capture mechanism, not a spec: entries record what
was decided and why at the time. Later entries may supersede earlier ones.
Where this log and `CLAUDE.md` disagree, the more recent of the two wins and
the other should be corrected.

Entry format:

```
## <short description>
- **WHEN:** YYYY-MM-DD
- **PROJECT:** closetkeeper
- **SYSTEM:** <module | admin | public | infra | process | cross-system>
- **SCOPE:** <minor/local | moderate | architectural>
- **STATUS:** tentative        (only when the maintainer expects it may change)
- **WHAT:** what was decided
- **WHY:** the rationale — the most important field
```

Entries are appended at the bottom, newest last.

---

## Backend module written in TypeScript, not Rust
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** cross-system
- **SCOPE:** architectural
- **WHAT:** The SpacetimeDB module is authored in TypeScript. The original
  CLAUDE.md, generated from a brainstorming session, specified a Rust module;
  that line was wrong and has been corrected.
- **WHY:** Three reasons. (1) Single-language maintainability: the project's
  operating assumption is that it gets edited at 10pm eighteen months from now
  with no context loaded, and a second language and toolchain is a context-switch
  cost paid on every such visit. (2) Shared types end to end: module, generated
  bindings, admin client, and Worker live in one type system. (3) Faster
  iteration: TypeScript modules run on V8, so there is no cargo/wasm compile in
  the edit-publish loop, and throughput at garage scale makes wasm's performance
  irrelevant.

## Deploy the module to Maincloud, not self-hosted
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** infra
- **SCOPE:** architectural
- **WHAT:** The production database runs on SpacetimeDB Maincloud. The
  original CLAUDE.md hedged between Maincloud and self-hosting.
- **WHY:** Low maintenance burden is a stated project goal; self-hosting means
  an always-on box, backups, and TLS that somebody has to own. Maincloud Free
  is $0 with roughly 1 GB storage and a 2,500 TeV monthly compute credit, which
  is ample. Known caveat to test before launch: Maincloud Free pauses a database
  after one week of inactivity, and the wake-up experience for a volunteer
  opening the app after a holiday week is not yet known.

## Start with SpacetimeDB's built-in identity provider
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** module
- **SCOPE:** architectural
- **WHAT:** Authentication uses SpacetimeDB's own identity to start. A
  third-party OIDC provider may replace it later; the data model stores
  identity as a linked field on `account` rather than as a primary key so the
  swap is survivable.
- **WHY:** Avoids standing up and paying for Auth0/Clerk/WorkOS before there is
  a single user. The consequence, recorded in CLAUDE.md: anyone can obtain a
  valid SpacetimeDB identity, so authentication proves only that a caller is
  someone, and the `staff_member` allowlist carries the entire authorization
  burden.

## Everything runs on the latest version; downgrades need sign-off
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** process
- **SCOPE:** moderate
- **WHAT:** Node, pnpm, the SpacetimeDB CLI, TypeScript, and every package
  run at the latest available version. This includes non-LTS Node (26.x over
  24 LTS) and TypeScript 7 over 5.x. If a dependency forces an older version
  of something else, surface the conflict and ask; prefer a different tool
  over a downgrade. Also written into CLAUDE.md under "Dependency policy".
- **WHY:** A small project that falls behind gradually becomes a project
  nobody can upgrade. The maintainer would rather absorb small breakages
  continuously than one large migration in two years.

## Biome for linting and formatting instead of ESLint + Prettier
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** process
- **SCOPE:** moderate
- **WHAT:** Biome 2.x is the single lint and format tool across the workspace.
- **WHY:** `typescript-eslint` declares a TypeScript peer range of
  `>=4.8.4 <6.1.0`, so the conventional ESLint stack cannot run alongside
  TypeScript 7. Biome does not invoke tsc and has no such constraint, and it
  replaces eslint, typescript-eslint, prettier, and plugins with one
  dependency. Accepted tradeoff: Biome has no full type-aware rules
  (no `no-floating-promises`); TypeScript's own checking still runs via
  `pnpm typecheck`. Revisit if typescript-eslint ships TS 7 support.

## TanStack Router for the admin SPA; TanStack Start reserved for public
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** admin
- **SCOPE:** architectural
- **WHAT:** The admin app uses `@tanstack/react-router` as a plain Vite SPA
  served from Cloudflare Workers static assets. TanStack Start is reserved for
  the phase-2 public site. React Router, named in the original CLAUDE.md, is
  not used.
- **WHY:** The admin UI must be client-side only (direct WebSocket to
  SpacetimeDB) while the public site must be SSR from KV. Cloudflare's own
  React Router guide states that SPA mode and prerendering are not supported
  under the Cloudflare Vite plugin, so React Router cannot serve both from one
  codebase. TanStack Start supports per-route `ssr: false` (selective SSR) and
  app-wide SPA mode, so it is the only option that keeps a single-codebase
  future open. Using TanStack Router now means the routing API is the same on
  both sides if that future arrives.

## Reserve the admin/public deployment split without deciding it
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** infra
- **SCOPE:** architectural
- **WHAT:** Layout is `spacetimedb/` (module), `apps/admin/` (built),
  `apps/public/` (reserved, empty), `packages/bindings/` (generated client
  bindings, committed). Whether admin and public ultimately ship as one
  TanStack Start Worker or two Workers is deferred until phase 2 begins.
- **WHY:** Nothing built today forecloses either shape. The "public site
  survives a database outage" requirement is satisfied by KV regardless of
  Worker count; what the split actually buys is deploy blast radius, and that
  tradeoff is better judged once the public site exists. Generated bindings
  are committed rather than produced at build time so that a schema change,
  including a table becoming public, shows up as a reviewable diff.

## Public repository under Apache-2.0
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** process
- **SCOPE:** moderate
- **WHAT:** `Syynth/closetkeeper` is public, licensed Apache-2.0, with GitHub
  secret scanning and push protection enabled. It was created private and
  flipped once the tree was verified to contain only scaffolding. Ownership may
  transfer to an organization for the nonprofit later; GitHub organizations
  are free and transfer preserves history.
- **WHY:** Public makes repository rules enforceable and secret scanning free
  on GitHub's Free plan, and lets other clothing closets reuse the software.
  The architecture already assumes a hostile network: secrets live only in CI
  and platform secret stores, seed data is synthetic, and authorization is an
  allowlist that reading the code does not help defeat. Apache-2.0 over MIT
  for the explicit patent grant; over AGPL because some organizations refuse
  AGPL code outright, which would defeat the reuse goal.

## Module tests: integration against a local instance, no mock harness
- **WHEN:** 2026-09-05
- **PROJECT:** closetkeeper
- **SYSTEM:** module
- **SCOPE:** moderate
- **WHAT:** Reducers are tested by integration tests against
  `spacetime start --in-memory`: publish the module, drive reducers through
  the SDK, assert via SQL. Reducers stay thin so real logic lives in plain
  functions Vitest can unit-test directly. A schema guardrail test fails CI if
  any table is public that is not on an explicit allowlist. No in-memory mock
  of the host is built now; the option is kept.
- **WHY:** There is no official SpacetimeDB test harness (upstream issue
  #2833 is open with no maintainer response). The community package
  `@douglance/stdb-test-utils` was rejected: one release, no repository URL,
  and built against the 1.x API rather than the 2.x `schema()`/`table()`
  builders. Building our own mock is feasible at the `spacetime:sys` seam
  (about 23 host functions) but requires reimplementing host semantics such
  as unique constraints, index range order, and auto-increment, which are
  exactly what the allowlist and gap report depend on; a divergence there
  would let a wrong test pass. At garage scale, integration tests against the
  real host cost seconds. Revisit when the suite is slow enough to hurt.
