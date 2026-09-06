# Inventory

Design for the first version of stock tracking, from the 2026-09-05
conversation. Decisions with their reasons are in
[`../decision-log.md`](../decision-log.md) under "inventory"; this document
is the shape they add up to. It is written to be built in the four steps at
the end, each a PR.

## Principles carried in

- Vocabularies are rows with an admin UI, never enums.
- Sizes are a closed vocabulary; no free text anywhere in a count.
- Counts are the source of truth. Item identity is optional and layered on.
- Donated vs purchased is captured at intake.
- All writes through `defineAdminReducer`; inventory reducers require
  `inventory.write`, so volunteers can do all of it, and none of it touches
  a family record.
- Mobile first. Log a bag is category, size, gender, condition, count: five
  taps standing in a garage, no keyboard.

## Vocabularies

| Table | Columns | Notes |
|---|---|---|
| `size_scale` | id, key, label | Seeded: `clothing`, `shoes`, `diapers`. Rarely edited. |
| `size` | id, scale_id, label, sort_order, active | Seeded per scale. Sort order is what makes "2T" come before "3T". |
| `category` | id, label, scale_id, sort_order, active | Seeded: Tops, Pants, Dresses, Outerwear, Pajamas, Underwear, Socks, Shoes, Diapers. Each category has exactly one size scale, so a category only ever offers the sizes that make sense for it. |
| `gender` | id, label, sort_order, active | Seeded: Boys, Girls, Neutral. |
| `condition` | id, label, sort_order, active, shelved | Seeded: New, Good, Worn (`shelved: false`). Unshelved conditions are counted at intake for reporting but never appear on the shelves screen: they went to textile recycling. |
| `location` | id, label, sort_order, active | Seeded: Shelves, Door. Where labeled items are; the vocabulary the readers will report against later. |

Deactivating a row hides it from intake and keeps every count that references
it. Labels are editable; keys (`size_scale.key`) are not.

## The spine

`slot` — one row per distinct (category, size, gender, condition), with a
unique index on the four ids. Created lazily by the first movement that
needs it, never pre-generated, so the table holds only combinations that
have existed. Everything that counts references a slot id, so renaming a
size or retiring a gender never orphans stock.

The module refuses a slot whose size is not on the category's scale.

## Counts

`stock_level` — `slot_id` (primary key), `on_hand`. The cache the shelves
screen reads. Maintained only by the reducers below; a test asserts it
equals the sum of the ledger.

`stock_movement` — append-only ledger: id, slot_id, delta, kind, at,
staff_id, bag_line_id (0 when none), item_id (0 when none), note.
`kind` is code, not rows, because bookkeeping depends on it:

| kind | delta | created by |
|---|---|---|
| `intake_donated` | + | closing a donated bag |
| `intake_purchased` | + | closing a purchased bag |
| `handed_out` | − | hand-out screen, or scanning an item |
| `discarded` | − | an item or count removed from stock |
| `correction` | ± | physical recount; the note says why |

Impact reporting for grants is a query over this table, by kind and month.

## Bags

`bag` — id, kind (`donated` \| `purchased`), status (`open` \| `closed`),
opened_at, opened_by, closed_at (epoch 0 while open), closed_by,
donor_person_id (0 until donors are modeled; the field exists now so the
receipt has somewhere to hang), note.

`bag_line` — id, bag_id, slot_id, count, created_at, created_by.

A bag is opened, lines and photos are added in any order, and it is closed.
Closing writes one `stock_movement` per line and locks the lines. An open bag
affects nothing on the shelves. A bag with photos and no lines can be closed
and tagged later; tagging a photo on a closed bag adds a line and its
movement immediately. Reopening is not a thing: corrections go through
`correction`.

## Photos

`photo` — id, bag_id, object_key, taken_at, uploaded_by, status
(`untagged` \| `tagged` \| `discarded`), bag_line_id (0 until tagged),
item_id (0 unless the photo was taken for a labeled item).

The bytes live in Cloudflare R2, in a private bucket, behind a small Worker
(`apps/edge`, phase 2 of this design). The Worker never holds a secret of
its own. It takes the caller's SpacetimeAuth token, asks the database *as
that caller* whether `my_staff` returns a row, and only then streams the
upload into R2 or the download out of it. It proxies rather than signing
URLs, so no S3 credential exists anywhere. The phone downsizes to ~1200 px
before upload. The database row is written by `register_photo` after the
Worker confirms the object exists.

**Rules.** No people in item photos; the intake screen says so. A photo is
purged when the bag it belongs to is purged, on the same retention schedule
as everything else. The `photo` table is private like the rest.

**Snap now, tag later.** The camera screen is the bag's second tab: shutter,
shutter, shutter, no other input. The tag screen shows the bag's untagged
photos as a strip; tapping one asks the five intake questions and creates
or increments a line with the photo attached. Discard marks the photo as not
an item. Untagged photos are a visible to-do on the bag list, not a lie in
the counts.

## Items (optional identity)

`item` — id, slot_id, status (`in_stock` \| `handed_out` \| `discarded`),
label_code, tag_id (empty until a hardware tag is attached), location_id,
bag_line_id (0 if unknown), created_at, created_by, photo_id (0 if none).

Labeling an item never changes a count; it names one unit that the count
already includes. Handing an item out does both at once: the item's status
flips and a `handed_out` movement of −1 is written for its slot. Correcting
a count does not touch items; a recount that finds a labeled item missing
uses `discard_item`.

**Labels.** `label_code` is a short, non-sequential code generated by the
module (so a guessed code finds nothing). The QR payload is
`https://<admin origin>/i/<label_code>`, so any phone camera opens the
item's page; inside the app the same camera scans a label to hand out,
relocate, or find. Detection uses the browser's `BarcodeDetector` with a
small fallback library where it is missing. Labels are a PDF generated in
the browser for a thermal label printer or a sheet of stickers.

## Reserved for hardware, not built

Two tables and one endpoint, added in phase 4 or whenever a reader exists.
Nothing in phases 1–3 needs migrating for them.

- `device` — id, label, identity, location_id, active. The allowlist for
  readers, the same idea as `staff_member` for people. A device identity is
  a separate allowlist: it can call `record_sighting` and nothing else.
- `sighting` — id, tag_id, device_id, at. Append-only, purged on a schedule
  like `access_event`. Whether the tag is a UHF RFID EPC, a BLE beacon, or
  an NFC sticker, it is a string here and on the item.
- The edge Worker gains one route that accepts a reader's post, checks its
  device credential, and calls `record_sighting` as that device's identity.
  Location updates on items derive from sightings, by reducer, not by the
  device.

## Reducers

All via `defineAdminReducer`. Capability `inventory.write` unless noted.

| Reducer | Does |
|---|---|
| `add_size`, `update_size`, `add_category`, `update_category`, `add_gender`, `update_gender`, `add_condition`, `update_condition`, `add_location`, `update_location` | Vocabulary rows. Update covers label, sort order, and active. |
| `open_bag(kind, note)` | Creates an open bag. |
| `add_bag_line(bag_id, category_id, size_id, gender_id, condition_id, count)` | Finds or creates the slot; adds or increments the line. Open bags only. |
| `remove_bag_line(line_id)` | Open bags only. |
| `close_bag(bag_id)` | Writes a movement per line, locks the bag. |
| `register_photo(bag_id, object_key, taken_at)` | After upload. |
| `tag_photo(photo_id, category_id, size_id, gender_id, condition_id, count)` | Adds or increments a line, attaches the photo; on a closed bag also writes the movement. |
| `discard_photo(photo_id)` | Not an item. |
| `hand_out(slot_id, count, note)` | −count movement. |
| `correct_count(slot_id, on_hand, note)` | Movement for the difference; note required. |
| `label_item(slot_id, bag_line_id, photo_id)` | Creates an item with a fresh label code. |
| `hand_out_item(label_code)`, `discard_item(label_code)`, `move_item(label_code, location_id)` | Item status and location; hand-out and discard also write the −1 movement. |
| `set_item_tag(label_code, tag_id)` | Attaches a hardware tag. |

Redaction: bag notes and movement notes are free text and could name a
donor, so `note` goes in `redact`.

## Views

Gated by `inventory.read`, which every role holds:

- `shelves` — one row per shelved slot with on-hand > 0, joined with the
  four labels and sort orders. The grid.
- `bag_list` — bags with line count, untagged-photo count, status.
- `bag_detail` — lines and photos for one bag (parameterized view, or two
  views filtered client-side).
- `item_lookup` — by label code, for the scan path.

Vocabulary tables can be read directly by clients through views of their
own; they hold nothing sensitive, but they stay private tables under the
guardrail like everything else.

## Screens

- **Shelves.** Category rows, size columns, gender and condition as filters
  above the grid with the counts summed when unfiltered. Tapping a cell
  offers hand out, correct, and labeled items in that slot.
- **Bags.** List with open bags first, each showing lines and untagged
  photos. New bag is one tap, donated or purchased.
- **Bag.** Three tabs: Lines (the five-tap intake), Camera, Tag. Close is a
  single button with a summary.
- **Item.** What it is, where it is, its photo, hand out, move, discard.
  Reached by scanning or by the `/i/<code>` link.
- **Scan.** Camera viewfinder; a recognised label opens the item.
- **More → Categories, Sizes, Genders, Conditions, Locations.** Same list
  and detail pattern as Roles.

## Steps

1. **Vocabularies, spine, ledger, bags without photos.** Tables, seeds,
   reducers, views, guardrail entries, the shelves grid, the bag list, and
   the five-tap intake. Export as CSV in the browser.
2. **Photos.** The `apps/edge` Worker with R2, the camera tab, snap now and
   tag later. First server-side code in the project; the deferred
   one-Worker-or-two decision gets decided here.
3. **Items and labels.** Item table, label codes, the item page, label PDF,
   scan to hand out.
4. **Readers.** Device allowlist, sightings, the reader route. When there is
   hardware to test against.
