# Where things stand

Status, not policy. `CLAUDE.md` says how this project works; this file says
how much of it exists. Last honest as of **2026-09-06**.

Keep it that way: when something here ships, move it up rather than deleting
it, and when a question here is answered, put the answer in
[`decision-log.md`](decision-log.md) and drop the line.

## Built, deployed, and in use on dev

Everything below is on `main`, published to `closetkeeper-dev`, and served at
`https://closetkeeper-admin-dev.syynth.workers.dev`.

- **Sign-in and authorization.** SpacetimeAuth, the `staff_member` allowlist,
  roles and capabilities as rows, the audit log, the access log, and the
  first-visit welcome.
- **Staff administration.** People, roles, the capability matrix, invitations
  by copied message, account and sign-in history.
- **Inventory.** The vocabularies (scales, sizes, categories, genders,
  conditions, bins), the `slot` spine, the append-only movement ledger with
  per-slot and per-bin caches, and bags with lines.
- **The screens for all of it.** Shelves with histograms and a size grid,
  hand out, fix a bin's count, bags with five-tap intake and a suggested
  bin, bins with "count this bin", the vocabulary editors, the audit and
  access logs, CSV export, and a dashboard.

Dev holds a few hundred demo items across seven bins, seeded by
[`scripts/seed-demo-stock.py`](../scripts/seed-demo-stock.py). Rerun it
against a fresh database whenever the data stops looking real.

## Not built

Roughly in the order they are worth doing.

1. **Requests, pickups and families.** Designed in
   [`design/requests.md`](design/requests.md); none of it exists. Four steps,
   starting with requests taken by phone. `merge_person` belongs here, and
   `CLAUDE.md` wants it before duplicates accumulate references.
2. **The gap report.** On-hand minus what is wanted. Waits on requests, since
   there is nothing to subtract until then.
3. **Donations.** Donor records, receipts describing items and never dollar
   values, and the `person_id ↔ external_donor_id` link. A bag already
   reserves `donor_person_id` and nothing fills it.
4. **Item labels and QR.** Step 2 of [`design/inventory.md`](design/inventory.md):
   optional identity for a garment, printable labels, scan to hand out.
5. **Reader hardware.** Step 3 of the same: the device allowlist, sightings,
   and the first Worker route. Waits for hardware to test against.
6. **The public site.** The request form, the donation-needs page, the KV
   snapshot pipeline, and the Worker with Turnstile in front of the form.
   This is what forces the deferred one-Worker-or-two decision.
7. **Retention.** Purging or anonymizing family records a fixed interval
   after their last appointment. Nothing to purge yet; the access log already
   purges itself after ninety days.

## Never done, and due before launch

- **Production does not exist.** There are no `v*` tags, so the module has
  never been published to `closetkeeper`, and the production database has
  never been created. The `prod` GitHub environment is configured.
- **Backups have never been taken, let alone restored.** `CLAUDE.md` asks for
  a restore actually performed once, not a procedure written down.
- **The Maincloud idle pause is untested.** The free tier pauses a database
  after a week idle, and nobody knows what a volunteer sees when they open
  the app after a holiday. Test it on dev.

## Broken, worked around

- **Magic-link emails arrive about half an hour late.** SpacetimeAuth accepts
  the request (`201`, the page polls) and the email does land — one took
  roughly thirty minutes, long after it was written off as never sent. This
  was first read as non-delivery and is really delivery nobody waits for.
  Google sign-in was enabled and is still what to offer when inviting
  somebody. Unknown, and worth knowing before anyone relies on the link:
  whether it is still valid when it finally arrives. Nothing has been
  reported to the SpacetimeDB Discord.
- **The dev database has been hand-patched twice**, because `init` runs once
  per database and later seeds never reached it: the `system_admin` role key
  after the rename, and the `access.read` and `inventory.manage` capabilities
  after they were added. A fresh database gets all of this from `init`. The
  publish workflow has a manual "Recreate the dev database" switch for when
  that is worth doing.

## Open questions

Nobody is blocked on these, but they are decisions rather than oversights.

- **Can a volunteer walk a gather list?** At a pickup somebody fetches items
  from bins. That list needs categories, sizes and bins and no name at all,
  but it is still a view of request data, which the second non-negotiable
  says volunteers cannot see.
- **Is the gap report volunteer-visible?** It drives donation asks, which is
  volunteer work. It is an aggregate with no person in it, but it is derived
  from requests, and with one open request an aggregate is not much of one.
- **Should staff see each other's last sign-in, or only system
  administrators?** Logged tentative.
- **Plain-English capability labels or the code keys?** Logged tentative; the
  app currently shows plain English.
- **The bag screen layout.** Reviewed and agreed in principle: sizes should
  wrap rather than scroll sideways, the five uppercase labels should come
  down to about two, and the bin line should collapse from a block to one
  tappable sentence. Not started.

## Things that have bitten, so they do not again

- **Columns are appended, never inserted.** Adding `location_id` in the
  middle of a table reordered its columns and the CLI refused to publish over
  existing data without `--delete-data`, which is exactly what production
  would have done. Append, always, with a default.
- **Verify the built bundle, not the source.** A `cd` that failed inside a
  chained shell command silently skipped the edits that wired the inventory
  routes into the navigation. Everything compiled; nothing linked to the new
  screens.
- **`init` runs once per database.** Anything added to it later is missing
  from every database that already exists. Either write a reducer that
  applies the same seed once, or recreate the database.
- **A view's row type may not share a name with the view's accessor.** The
  host rejects the module with a name collision that reads as unrelated.
- **The host derives index names from table and column**, so `size_scale.id`
  collided with `size.scale_id`. The table is called `scale` for that reason.
