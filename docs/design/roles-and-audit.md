# Design proposal: configurable roles, super-admin, and the audit log

Status: **proposal**, 2026-09-05. Nothing here is built. Decisions taken from
it go in `docs/decision-log.md`.

## Goals

1. Roles can be created and adjusted by the org without a republish, while
   the privacy constraints in `CLAUDE.md` cannot be relaxed casually.
2. At least one account is a super-admin that can do everything, including
   granting the protected capabilities.
3. Every mutation is audited **by construction**. It must not be possible to
   add a reducer and forget the audit line; forgetting must fail CI.
4. The audit log doubles as the impact-reporting source for grants.
5. Nothing in the audit log is personally identifying.

## What the platform does and does not give us

- Reducers are the only mutation path. That is the hook we build on.
- SpacetimeDB keeps no queryable history. Its **event tables** are the
  opposite of an audit log: rows live only for the transaction that created
  them, are broadcast to subscribers, then deleted. Not usable here.
- The server SDK has no reducer middleware. Automation therefore lives in
  our code: one helper that is the only way to declare an admin reducer, and
  a test that proves every reducer went through it.

## Capabilities: code. Roles: rows.

A **capability** is a thing a reducer checks. It is meaningless unless code
checks it, so capabilities are a closed set in `auth-rules.ts`, as today.

A **role** is a named bundle of capabilities, stored as rows so staff can
create "intake volunteer" or "board treasurer" without a republish.

```
role
  id            u64 pk autoinc
  key           string unique        machine name, e.g. "volunteer"; never renamed
  label         string               shown in the UI; editable
  description   string
  system        bool                 seeded by init; cannot be deleted
  created_at    timestamp

role_capability
  id            u64 pk autoinc
  role_id       u64 index
  capability    string               one of CAPABILITIES; validated on insert
  (unique index on role_id + capability)

staff_member
  role          string   →  role_id  u64 index        (replaces the string column)
```

`init` seeds four system roles:

| role | capabilities |
|---|---|
| `super_admin` | all |
| `staff` | inventory.*, donation.*, family.*, staff.manage |
| `volunteer` | inventory.*, donation.* |
| `treasurer` | inventory.read, donation.read, financial.read |

`requireStaff(ctx, capability)` resolves sender → link → staff_member → role
→ role_capability, exactly as today plus one hop.

### Protected capabilities

Some capabilities encode the non-negotiable constraints. They are marked
`protected` in code:

- `family.read`, `family.write` — constraint 2, volunteers never see families
- `role.manage` — the ability to change what roles can do
- `staff.manage_sensitive` — granting protected capabilities to anyone

Granting a protected capability to a role requires the caller to hold
`staff.manage_sensitive`, which only `super_admin` has by default and which
can only be granted by a super-admin. Every grant is an audited event. The
constraints stay configurable, but only by someone who is explicitly
trusted with them, and never silently.

### Super-admin

- `super_admin` is a system role holding every capability.
- `init` gives it to the publisher; the bootstrap invite in CI gives it to
  `BOOTSTRAP_STAFF_EMAIL`.
- **The last active super-admin cannot be demoted or deactivated.** This
  generalizes today's "cannot change your own status" rule and closes the
  lockout hole where two admins deactivate each other.

### Reducers

| reducer | capability | notes |
|---|---|---|
| `create_role(key, label, description)` | `role.manage` | key immutable |
| `update_role(role_id, label, description)` | `role.manage` | |
| `delete_role(role_id)` | `role.manage` | refuses system roles and roles in use |
| `grant_capability(role_id, capability)` | `role.manage`; `staff.manage_sensitive` if protected | |
| `revoke_capability(role_id, capability)` | `role.manage` | cannot strip `super_admin` |
| `invite_staff(email, display_name, role_key)` | `staff.manage`; `staff.manage_sensitive` if the role holds a protected capability | replaces the role-string version |
| `set_staff_role(staff_id, role_key)` | same rule as invite | last-super-admin guard |
| `set_staff_active(staff_id, active)` | `staff.manage` | last-super-admin guard |

## The audit log

```
audit_event
  id            u64 pk autoinc
  at            timestamp index
  actor_staff_id u64 index          0 for system (init, scheduled)
  action        string index        the reducer name, e.g. "invite_staff"
  target_table  string              "" when not about one row
  target_id     u64                 0 when not about one row
  details       string              JSON object; see PII rule
  outcome       string              "ok" | "denied" | "error"
```

Private table. Nothing about it is ever public.

### Written by construction

`defineAdminReducer` becomes the only way to declare an admin reducer:

```ts
export const inviteStaff = defineAdminReducer({
  name: "invite_staff",
  capability: "staff.manage",
  args: { email: t.string(), display_name: t.string(), role_key: t.string() },
  audit: { redact: ["email", "display_name"] },
}, (ctx, staff, args) => {
  // body; returns { target_table, target_id, details? } or nothing
});
```

The helper: runs `requireStaff`; runs the body; writes one `audit_event`
with the actor, the action, the body's target, and the args minus redacted
fields; and if the body throws, records the same event with `outcome:
"denied"` or `"error"` before rethrowing. A refused attempt is therefore
also in the log, which is what "treat a missing allowlist check as a
breach" needs to be detectable.

Every call through the helper also lands in a module-level registry.

### Cannot be forgotten

A guardrail test, alongside the schema guardrail:

1. Publish to the local instance, read `describe --json`, list every reducer.
2. Every reducer must be either in the `defineAdminReducer` registry or on a
   short explicit allowlist of lifecycle hooks (`init`, `client_connected`,
   `client_disconnected`) with a stated reason.
3. Otherwise the test fails, naming the reducer.

Declaring a reducer with `spacetimedb.reducer` directly is therefore a red
check, not a missing row discovered later.

### No PII in the log

- `details` holds IDs, keys, counts, and enums. Never names, emails, phone
  numbers, or addresses. Reducers that take such arguments must list them in
  `audit.redact`; the helper strips them before writing.
- A test scans `details` of every event produced by the integration suite
  for `@` and for the argument names of known-PII fields, and fails on any
  hit. Cheap and catches the obvious mistake.
- Consequence for retention: purging a person never has to edit the audit
  log, only the rows the log points at. Impact counts survive the purge.

### Reporting

`action` is the reducer name, so "how many appointments were fulfilled in
Q3" is a count over `audit_event` by action and time. That is the
grant-reporting story, and it is why actions are a closed vocabulary rather
than free text.

## Provenance (for later, but shaped now)

Inventory will be a **ledger**, not a count: an `inventory_movement` row
per change with a signed delta, a reason, and a reference to the donation
or appointment that caused it. On-hand is a sum. The audit log records *who
called what*; the ledger records *what changed and why*. They are different
tables with different retention, and both are shaped by this proposal only
in that every movement is created through an audited reducer.

## Rollout

- No production data exists, so `staff_member.role` can change from string
  to `role_id` now. Dev wipes itself on conflict; local is recreated per
  session. This is the last cheap moment for that change.
- One PR: role tables, seed, the helper, the migrated staff reducers, the
  two guardrails, and the audit-event integration tests. The admin UI's
  `my_staff` view returns the role key and label instead of a string.

## Open questions for the maintainer

1. Should a super-admin be able to **delete** audit events, or is the log
   append-only for everyone? (Proposal: append-only. Nobody deletes.)
2. Should denied attempts by **anonymous** callers be logged? They carry no
   staff id and could be spammed. (Proposal: no. Log denials only for
   callers who resolved to a staff member but lacked the capability.)
3. Is `treasurer` a real role today, or a placeholder from the brainstorm?
   Seeding it costs nothing, but a system role cannot be deleted later.
