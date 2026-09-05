import { schema } from 'spacetimedb/server';

/**
 * Closetkeeper module.
 *
 * The schema is intentionally empty — tables are added in the schema design
 * step, not here.
 *
 * NOTE: the `spacetime init` template ships a `person` table declared
 * `{ public: true }`. It was removed deliberately. Tables holding person,
 * request, or appointment data must never be public; see CLAUDE.md, which
 * treats that as a legal and safety constraint rather than a preference.
 */
const spacetimedb = schema({});

export default spacetimedb;

export const init = spacetimedb.init(_ctx => {
  // Seed vocabulary tables here: categories, sizes, conditions, request
  // statuses. These are rows rather than enums so they can be edited without
  // a republish.
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Validate the JWT issuer and audience, then resolve the caller to a
  // staff_member row. Authentication alone confers no authorization.
});

export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {
  // No-op for now.
});
