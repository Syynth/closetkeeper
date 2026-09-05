# The admin app's design system

Status: in use as of 2026-09-05 (Mantine theme in `apps/admin/src/theme.ts`).

## Who it is for

Someone standing in a garage holding a bag of kids' clothes, on a phone,
often with one hand. Later, someone at a desk doing the books. The first
person wins every tie.

## The rules

1. **Nothing smaller than a thumb.** Every control is at least 48px tall.
   Mantine's `lg` size is the default for buttons and inputs.
2. **Three taps to log a bag.** Category, size, count. Anything that adds a
   tap to that path needs a reason.
3. **No keyboard unless there is no other way.** Prefer selects, steppers,
   and tags to text fields. When text is unavoidable, set `inputMode`.
4. **One column.** The phone layout is the layout; wider screens get more
   margin, not more columns, until a screen genuinely needs them.
5. **Read at arm's length.** Base type is 17px, body face is Atkinson
   Hyperlegible Next, contrast is bark-on-cotton.

## Tokens

Colors come from the closet and the county. Each is a 10-shade Mantine
tuple; the working shade is listed.

| Name | Working shade | Used for |
|---|---|---|
| `pine` | `#2f5d3a` (7) | primary actions, active states, the wordmark accent |
| `tape` | `#e9c46a` (4) | the size tag: roles, sizes, statuses, eyebrows |
| `bark` | `#2b221b` (9) | text; lighter shades for borders and muted text |
| `clay` | `#b5533c` (6) | errors and destructive states |
| `sky` | `#6c9bc9` (4) | informational, reserved |
| page | `#f3f4f1` | washed cotton, the ground everything sits on |

Type: **Bricolage Grotesque** (variable) for the wordmark and headings,
weight 700–800, tight tracking. **Atkinson Hyperlegible Next** (variable)
for everything else. Both self-hosted from `@fontsource-variable`.

Radius `md` is 10px. Cards are `lg` (14px) with a border, no shadow.

## The signature: the size tag

Bins in the closet are labelled with masking tape and a marker. The
`SizeTag` component (`apps/admin/src/components/SizeTag.tsx`) is that
label: tape yellow, bark text, display face, and a hand-cut corner via
`clip-path`. Tones: `tape` (default), `pine` (positive/active), `clay`
(problem), `muted` (inactive). It is the only place the design spends
personality; everything around it stays quiet.

`SizeStrip` is a decorative row of kids' sizes used once, on the sign-in
page, to say what this place is without a paragraph. It is `aria-hidden`
and its entrance animation respects `prefers-reduced-motion`.

## Writing

Sentence case. Plain verbs that say what happens: "Email me a sign-in
link", "Add to staff". The same word for the same action everywhere.
Errors say what went wrong and what to do; they don't apologize. Empty
states say what to do next.

## What is deliberately not here

- Dark mode. Forced light for now; the garage is not dark and the theme
  has no dark palette yet. Add one when someone asks.
- Icons. None yet. When they arrive, one set, used sparingly.
- Animation beyond the strip's entrance. Motion has to earn its place.
