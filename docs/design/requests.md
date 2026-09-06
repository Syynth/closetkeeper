# Requests

How a family asks for clothes, and how that ends in them walking out with
a bag. Written 2026-09-06, before any of it is built. Decisions with their
reasons are in [`../decision-log.md`](../decision-log.md).

Phase 1 is staff recording requests that arrive by phone, at the door, or
through a school. The public form is phase 2 and is designed for here
without being built.

## What a request is

**A request is a want, never a hold.** Recording one changes nothing on the
shelves. Two families can ask for the same coat, and the second one finds
out at pickup, not at submission. This is not a limitation to be fixed
later; it is what keeps the counts honest in a closet where the goods are
physically sitting in bins that anyone can take from.

Everything follows from that:

- **Nothing is reserved, and nothing is packed ahead.** The clothes stay in
  their bins until the family is standing there. That is why the app keeps
  counting them: they are still on the shelf and still available to whoever
  arrives first.
- **Availability is decided at resolution, twice.** Once when a pickup is
  scheduled, so nobody agrees to a time for a request the closet plainly
  cannot fill, and again at the pickup itself, when the numbers are whatever
  they are that morning. Both readings are computed live from
  `stock_bin_level`; neither is ever stored on the request.
- **Stock leaves at collection.** One `handed_out` movement per thing that
  actually goes, out of the bin it came from, carrying the pickup it
  belongs to. Nothing before that moment moves a count.

## A pickup is not a checklist

What a family leaves with is never quite what they asked for. The 4T coat
does not fit, so they take the 5. There are two pairs of shoes on the shelf
nobody thought to ask for. A parent looks at the pyjamas and says no thank
you. **The request is what started the conversation; the pickup is what
happened.** The app records both and never pretends the first predicts the
second.

So the pickup screen is not the request with tick boxes. It is two things
side by side: what they asked for, with what is on hand beside each line
right now, and what is going home, which starts empty and is filled from
the shelves by the same hand-out action used anywhere else. Anything can go
in it, requested or not. Any line can go unanswered.

Nothing scores this. A request with three lines and a pickup with seven
items is a good day, not a discrepancy, and the app does not colour it red
or call it partially filled. What it does do is keep the difference legible
afterwards: the wanted lines and the given items are both on the record, so
"we could not do 4T coats in February" is answerable a year later.

**A pickup does not need a request.** Someone who turns up at the door is a
pickup with no request attached, recorded the same way. That makes the
pickup, not the request, the unit of "somebody left with things", which is
what the ledger and the reports care about.

## Anonymous and contactable

Two kinds of request, and the difference is the whole model rather than a
flag on a form:

| | Anonymous | With contact |
|---|---|---|
| What it is for | Saying a need exists | Getting clothes to a family |
| Person record | none | a `person` with a way to reach them |
| Can be scheduled | no | yes |
| Can be filled | no | yes |
| Counts toward the gap report | yes | yes |
| Holds anything to purge | no | yes |

**An anonymous request is demand, not a promise.** It tells the org that
somebody needed 4T coats in February, which is exactly what a grant
application and a donation ask are built from, and it costs the family
nothing to say. It cannot be scheduled or collected, because there is
nobody to tell when it is ready and nobody to hand it to. The form says so
in those words, at the moment of choosing, not in a footnote afterwards.

**Upgrading is one call.** A family who left an anonymous request and later
rings up gets a person attached to the same request, and it becomes
fulfillable without losing what they already told us. There is no downgrade:
once contact exists, forgetting it is a retention job, not a button.

Because an anonymous request holds nothing personal, it can be kept
indefinitely as demand history. A contactable one is purged on the same
retention schedule as everything else, a fixed interval after its last
activity. That asymmetry is a feature: the org keeps the shape of the need
long after it has forgotten the family.

## Asking

A request line is the same vocabulary as the shelves, minus condition:
category, size, and who it is for. It matches the spine exactly, which is
what lets the gap report subtract one from the other without translation.

Condition is deliberately absent. A family asks for a coat, not a good coat;
staff decide what to give from what is there, and the closet has already
decided that worn things do not go on the shelves at all.

Kids' sizing being what it is, every line carries an optional **age note** in
free text ("about 4, tall for it"). It is a hint for the person packing, not
a second way of asking: the size is still what the line is made of, so a
line is always matchable against stock. When a parent genuinely does not
know, staff pick the size the age implies and the note records the doubt.

## Availability, meaning time

A family says *when they could come* as a set of windows, not a slot they
have booked. Windows are a vocabulary (`time_window`: weekday mornings,
weekday afternoons, evenings, Saturday), so the org can reshape them when
its hours change.

At resolution, staff pick a concrete time inside one of those windows and
the request gets a `pickup` row. The app shows what else is already
scheduled that day, and how much of the request the shelves can currently
cover, but it does not manage a calendar of bookable slots. A closet doing
dozens of appointments a month does not have a slot inventory problem; it
has a "did we agree on a time and did they turn up" problem, which is what
the pickup row records.

A missed pickup keeps its row and gets a new one. That history is how you
notice a family who cannot make mornings work.

## Tables

| Table | Columns | Notes |
|---|---|---|
| `request` | id, status, person_id (0 = anonymous), source, note, submitted_at, submitted_by (0 = public), closed_at, close_reason | Private, and on the never-public list. |
| `request_line` | id, request_id, category_id, size_id, gender_id, wanted, age_note | What was asked for, and nothing about what happened. There is deliberately no `filled` column: a pickup that hands over something never requested has nothing to put in one. |
| `time_window` | id, label, sort_order, active | Vocabulary, seeded and editable. |
| `request_window` | id, request_id, window_id | When they could come. Empty for anonymous. |
| `pickup` | id, request_id (0 = walk-in), person_id, at, status, note, scheduled_by, scheduled_at | `scheduled` \| `collected` \| `missed` \| `cancelled`. A missed pickup is kept; a new row supersedes it. |
| `stock_movement.pickup_id` | appended, default 0 | Which pickup a hand-out belongs to, and through it the request, if there was one. |

`request.status`: `open` → `scheduled` → `filled`, or `closed` from anywhere
with a reason (withdrawn, unreachable, expired, filled elsewhere). Status is
a small closed set in code, like movement kinds, because reports branch on
it.

**Readiness is never a column.** How much of a request the closet can cover
is computed from `stock_bin_level` every time it is displayed. Storing it
would mean a number that is wrong the moment somebody else takes a coat.

**What was given is never a column either.** It is the movements carrying
that pickup's id, which is the same ledger everything else reads. One place
records that something left the building, and requests are a lens on it
rather than a second set of books.

## Who sees what

CLAUDE.md's second non-negotiable: volunteers cannot see request or family
data. Everything here is gated on `family.read` and `family.write`, and
every table is added to the guardrail's never-public list.

Two places where that rule needs a decision rather than an assumption, both
flagged rather than quietly settled:

- **The gather list.** At a pickup, somebody walks the bins with a list of
  what to fetch. That list needs categories, sizes and bins, and needs no
  name at all. Letting a volunteer gather without seeing the family would be
  genuinely useful, and it is still a view of request data. Ask before
  building it either way.
- **The gap report.** On-hand minus open request lines, by category, size
  and gender, is the thing that drives donation asks, which is volunteer
  work. It is an aggregate with no person in it, but it is derived from
  requests, and with one open request an aggregate is not much of one.
  Suppression below three is already the rule for anything published;
  whether it is also the rule internally is a decision.

Nothing about a request is ever public. Published counts stay suppressed
below three and are never broken down by school or neighbourhood.

## Reducers

All through `defineAdminReducer`, `family.write` unless noted. Names and
notes are personal, so they go in `redact`.

| Reducer | Does |
|---|---|
| `create_request(source, note)` | Anonymous by default. Returns nothing; the client reads the newest. |
| `attach_person(request_id, person_id)` | Makes an anonymous request fulfillable. |
| `create_person(name, phone, email, notes)` | A family record. Also what phone intake calls first. |
| `add_request_line(request_id, category_id, size_id, gender_id, wanted, age_note)` | Finds or increments the line. |
| `remove_request_line(line_id)` | Open requests only. |
| `set_request_windows(request_id, window_ids)` | When they could come. |
| `schedule_pickup(request_id, at, note)` | Refuses an anonymous request, in those words. |
| `reschedule_pickup(pickup_id, at)`, `miss_pickup(pickup_id)`, `cancel_pickup(pickup_id)` | The pickup's own life. |
| `start_pickup(request_id, person_id)` | Opens a pickup for today. `request_id` 0 is a walk-in. |
| `give(pickup_id, slot_id, location_id, count)` | One `handed_out` movement out of that bin, carrying the pickup. Whatever is on the shelves, requested or not. Refuses more than the bin holds. |
| `ungive(movement_id)` | They changed their mind at the door. Writes the opposite movement rather than deleting the first. |
| `finish_pickup(pickup_id, note)` | Marks it collected. Does not judge whether the request was "filled": a person decides that. |
| `close_request(request_id, reason)` | From any status. |
| `add_time_window`, `update_time_window` | Vocabulary, `inventory.manage`. |

`merge_person` is the one CLAUDE.md calls for early, before duplicates
accumulate references. It belongs with this work, not after it.

## Views

- `request_list` — status, who or "Anonymous", how many lines, what is
  wanted, when it came in, the next pickup, and how much of it the shelves
  can cover right now.
- `request_detail_lines` — each line with `wanted` and `on_hand` computed
  live, plus which bins hold it.
- `pickup_given` — what has actually gone out on a pickup, from the ledger.
- `pickup_schedule` — what is agreed, by day.
- `demand` — open request lines summed by category, size and gender. Feeds
  the gap report, gated per the decision above.

## Screens

- **Requests.** A list, filtered by status, newest first. Anonymous ones
  carry a muted tag, since they are demand and cannot be acted on.
- **New request.** Anonymous or with contact, chosen first because it
  changes what the rest of the form is for. Then lines, then windows if
  contactable.
- **Request.** Who, the lines with what is on hand *now* beside each, the
  windows, and the actions that apply: schedule, fill, close.
- **Pickup.** The day's appointments. Inside one: what they asked for with
  live counts on the left, what is going home on the right, and the shelves
  a tap away to add anything else. Finishing it is one button and no
  arithmetic.
- **Gap.** On-hand minus wanted, by category and size, on the same grid as
  the shelves.

## The public form, phase 2

Not built. The shape it has to take:

The module is on the open internet and any client can connect anonymously,
so a reducer the public can call is a reducer the public can spam, and
SpacetimeDB has no rate limiting of its own. The public form therefore does
not talk to the database directly. It posts to a Worker that verifies a
Cloudflare Turnstile token and then calls the reducer over
`POST /v1/database/:name/call` with a token of its own. That Worker is the
project's first server-side code and its first runtime secret, which is
exactly the deferred one-Worker-or-two decision coming due.

Everything above is designed so that form can be thin: it creates an
anonymous request by default, offers contact as the thing that makes a
pickup possible, and adds lines from the same vocabularies the admin uses.

## Steps

1. **Requests, by phone.** Tables, the vocabulary, reducers, views, the list,
   the new-request form, and the request screen. Anonymous and contactable
   both, with `merge_person`.
2. **Pickups.** Scheduling against stated windows, the day's schedule, the
   gather list, giving from the shelves, walk-ins, missed and rescheduled.
3. **The gap report.** On-hand minus wanted, once there are real requests to
   subtract.
4. **The public form.** The Worker, Turnstile, and the phase-2 site.
