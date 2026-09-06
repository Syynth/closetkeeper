# Inventory

Design for the first version of stock tracking, from the 2026-09-05
conversation. Decisions with their reasons are in
[`../decision-log.md`](../decision-log.md) under "inventory"; this document
is the shape they add up to. It is written to be built in the three steps at
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
| `scale` | id, key, label | Seeded: `clothing`, `shoes`, `diapers`. Rarely edited. |
| `size` | id, scale_id, label, sort_order, active | Seeded per scale. Sort order is what makes "2T" come before "3T". |
| `category` | id, label, scale_id, sort_order, active | Seeded: Tops, Pants, Dresses, Outerwear, Pajamas, Underwear, Socks, Shoes, Diapers. Each category has exactly one size scale, so a category only ever offers the sizes that make sense for it. |
| `gender` | id, label, sort_order, active | Seeded: Boys, Girls, Neutral. |
| `condition` | id, label, sort_order, active, shelved | Seeded: New, Good, Worn (`shelved: false`). Unshelved conditions are counted at intake for reporting but never appear on the shelves screen: they went to textile recycling. |
| `location` | id, label, label_code, sort_order, active | The bins, racks and shelves stock physically lives in. Seeded: Shelves, Door. `label_code` is generated like an item's, so a sticker on a bin opens that bin. Called "bins and places" on screen. |

Deactivating a row hides it from intake and keeps every count that references
it. Labels are editable; keys (`scale.key`) are not.

## The spine

`slot` — one row per distinct (category, size, gender, condition), with a
unique index on the four ids. Created lazily by the first movement that
needs it, never pre-generated, so the table holds only combinations that
have existed. Everything that counts references a slot id, so renaming a
size or retiring a gender never orphans stock.

The module refuses a slot whose size is not on the category's scale.

## Counts

`stock_level` — `slot_id` (primary key), `on_hand`. The slot's total, what
the shelves screen reads. Maintained only by the movement helper; a test
asserts it equals the sum of the ledger.

`stock_bin_level` — `key` (`slot_id:location_id`, unique), `slot_id`,
`location_id`, `on_hand`. The same count broken down by where it physically
is. Location is a breakdown *inside* a slot, never a fifth dimension of the
slot itself: the slot stays the reporting spine, so the gap report, the grid
and every export keep working untouched, and a bin that is renamed or
retired never splits a category's history.

`stock_movement` — append-only ledger: id, slot_id, location_id, delta,
kind, at, staff_id, bag_line_id (0 when none), item_id (0 when none), note.
Every movement says which bin it came from or went into, so both levels are
derivable from the ledger alone.
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

`bag_line` — id, bag_id, slot_id, location_id, count, created_at,
created_by. The location is where the line is headed; the app suggests it
and the volunteer usually just accepts it.

A bag is opened, lines are added, and it is closed. Closing writes one
`stock_movement` per line and locks the lines. An open bag affects nothing
on the shelves. Reopening is not a thing: corrections go through
`correction`.

## Where things are

Counts are per bin, because a bin is what a person counts and a bin is what
they walk to. Three rules keep that from costing taps:

- **A suggested home at intake.** When a line's slot already has stock, the
  app offers the bin holding the most of it and says why ("4T tops already
  live there"). With no history it falls back to the bin holding the most of
  that category and size in any gender, then to the last bin used in this
  bag. It is a picker, not a question: one tap to change, none to accept.
- **No question when there is nothing to ask.** Handing out from a slot
  whose stock is all in one bin states the bin and hands out. Only genuinely
  split stock shows a chooser, biggest bin first.
- **A filter, not a column.** The shelves and the grid sum across bins by
  default, with a bin filter under the gender segments. Filtering by a bin
  shows only what that bin holds, which is the same view a bin's own sticker
  opens.

Bins are managed under More, Bins & places: add, rename, reorder, retire,
see what is inside, and "count this bin", which walks its contents one line
at a time so a physical recount is one screen and many small confirmations.
Retiring a bin is refused while it still holds stock.

## Photos: not planned

Camera-first intake (snap a bag, tag later) was designed and then dropped
on 2026-09-05: photos of donations turned out to have no use downstream.
Intake is the five-tap line entry.
Nothing here needs an object store or a Worker with code, so the
one-Worker-or-two decision stays deferred.

## Items (optional identity)

`item` — id, slot_id, status (`in_stock` \| `handed_out` \| `discarded`),
label_code, tag_id (empty until a hardware tag is attached), location_id,
bag_line_id (0 if unknown), created_at, created_by.

Wanted, not a priority: step 2 below, after the counts have been in use.

Labeling an item never changes a count; it names one unit that the count
already includes. Handing an item out does both at once: the item's status
flips and a `handed_out` movement of −1 is written for its slot. Correcting
a count does not touch items; a recount that finds a labeled item missing
uses `discard_item`.

**Labels.** `label_code` is a short, non-sequential code generated by the
module (so a guessed code finds nothing). Items and bins both have one. The only payload ever printed on a label or written to an NFC sticker
is an https link into the app: `https://<origin>/i/<code>` for an item,
`https://<origin>/b/<code>` for a bin or shelf. Any phone camera opens a QR
of it, and any recent phone reads an NFC sticker holding it in the
background with no app installed. Inside the app the same camera scans a
label to hand out, relocate, or find, using the browser's `BarcodeDetector`
with a small fallback library where it is missing. Labels are a PDF
generated in the browser for a thermal label printer or a sheet of
stickers. Standard NFC stickers suit bins and hangers; laundry-safe garment
tags exist and cost more, so garments are the experiment, bins the norm.

The item page and the bin page are entry points: they must work from a cold
open, signed out (sign in, come back to the same URL) and signed in.

## Mobile app (tentative, later)

An Expo app, `apps/mobile`, for the jobs the web is bad at: writing NFC
stickers (iOS has no web NFC), a camera that stays open and scans
continuously, and opening straight into an item or bin when a sticker is
tapped. That last part is universal links / app links: two static files
under `/.well-known/` on the admin origin, which the asset-only Worker can
serve, and a real domain. The app uses the same module, the same generated
bindings package, and the same SpacetimeAuth client with one more redirect
URI; it needs a dev-client build, not Expo Go, because the NFC library is
native. It is deliberately narrow: bags, scan, tag writing, item and bin
pages. Everything administrative stays on the web. UI is not
shared with the web app (Mantine is web-only); tokens and the tag visual
carry over.

## Reserved for hardware, not built

Two tables and one endpoint, added in step 3 or whenever a reader exists.
Nothing in steps 1–2 needs migrating for them.

- `device` — id, label, identity, location_id, active. The allowlist for
  readers, the same idea as `staff_member` for people. A device identity is
  a separate allowlist: it can call `record_sighting` and nothing else.
- `sighting` — id, tag_id, device_id, at. Append-only, purged on a schedule
  like `access_event`. Whether the tag is a UHF RFID EPC, a BLE beacon, or
  an NFC sticker, it is a string here and on the item.
- A small Worker with code (the project's first) with one route that
  accepts a reader's post, checks its device credential, and calls
  `record_sighting` as that device's identity.
  Location updates on items derive from sightings, by reducer, not by the
  device.

## Reducers

All via `defineAdminReducer`. Capability `inventory.write` unless noted.

| Reducer | Does |
|---|---|
| `add_size`, `update_size`, `add_category`, `update_category`, `add_gender`, `update_gender`, `add_condition`, `update_condition` | Vocabulary rows. Update covers label, sort order, and active. |
| `add_location`, `update_location` | Bins. Retiring one is refused while it still holds stock. |
| `open_bag(kind, note)` | Creates an open bag. |
| `add_bag_line(bag_id, category_id, size_id, gender_id, condition_id, location_id, count)` | Finds or creates the slot; adds or increments the line for that slot and bin. Open bags only. The suggested bin is computed in the client from `bin_levels`; nothing is written until the line is added. |
| `remove_bag_line(line_id)` | Open bags only. |
| `close_bag(bag_id)` | Writes a movement per line, locks the bag. |
| `hand_out(slot_id, location_id, count, note)` | −count movement out of that bin. Refuses more than the bin holds. |
| `correct_count(slot_id, location_id, on_hand, note)` | Sets one bin's count. Movement for the difference; note required. |
| `label_item(slot_id, bag_line_id)` | Creates an item with a fresh label code. |
| `hand_out_item(label_code)`, `discard_item(label_code)`, `move_item(label_code, location_id)` | Item status and location; hand-out and discard also write the −1 movement. |
| `set_item_tag(label_code, tag_id)` | Attaches a hardware tag. |

Redaction: bag notes and movement notes are free text and could name a
donor, so `note` goes in `redact`.

## Views

Gated by `inventory.read`, which every role holds:

- `shelves` — one row per shelved slot, joined with the four labels and
  sort orders, carrying the total and how many bins hold it, so the client
  knows whether handing out needs to ask.
- `bin_levels` — slot × location with a count, for the bin filter, the bin
  chooser, a bin's own page, and the intake suggestion.
- `bag_list` — bags with line count and status.
- `bag_lines` — lines with their slot labels, filtered client-side by bag.
- `item_lookup` — by label code, for the scan path.

Vocabulary tables can be read directly by clients through views of their
own; they hold nothing sensitive, but they stay private tables under the
guardrail like everything else.

## Screens

- **Shelves.** On a phone, a list of categories with the total and a faint
  histogram of that category's spread across sizes behind each row; the grid
  itself is a desktop thing. Gender segments on their own row, then the bin
  filter. Tapping a category opens its size grid, each cell filled in
  proportion to what it holds. Tapping a cell offers hand out and set a
  bin's count.
- **Bags.** List with open bags first, each showing its line count. New bag
  is one tap, donated or purchased.
- **Bag.** The five-tap intake, a running list of lines, and Close with a
  summary.
- **Item.** What it is, where it is, hand out, move, discard. Reached by
  scanning or by the `/i/<code>` link.
- **Scan.** Camera viewfinder; a recognised label opens the item.
- **More, The closet.** Categories, Bins & places, Conditions, For. Sizes
  are not a top-level row: they live inside a category, which is where
  someone goes looking for them, with what is on hand beside each and an
  honest line about which other categories share the list.
- **Bin.** What is in it, rename, and "count this bin".

## Steps

1. **Vocabularies, spine, ledger, bags.** Tables, seeds, reducers, views,
   guardrail entries, the shelves grid, the bag list, and the five-tap
   intake. Export as CSV in the browser.
2. **Items and labels.** Item table, label codes, the item and bin pages,
   label PDF, scan to hand out. Wanted, not a priority.
3. **Readers.** Device allowlist, sightings, the reader route, and the first
   server-side Worker. When there is hardware to test against.
