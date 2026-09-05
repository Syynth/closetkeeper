/**
 * Module configuration. Nothing here is secret or personal: a module is
 * public by construction (anyone can connect and read its schema), so this
 * file holds only values that are safe to publish. Secrets and emails never
 * belong in a module; the first staff email is a repository secret consumed
 * by CI after publish, and the publisher's own identity is seeded by `init`.
 */

/** The OIDC issuer whose tokens may resolve to staff. */
export const TRUSTED_ISSUER = "https://auth.spacetimedb.com/oidc";

/**
 * SpacetimeAuth client IDs whose tokens this module accepts. A token whose
 * audience does not include one of these is treated as unauthenticated, so a
 * token minted for some other application can never resolve to staff.
 *
 * Empty until the SpacetimeAuth project exists. While empty, no browser login
 * can link to a staff account, which is the safe failure.
 */
export const TRUSTED_CLIENT_IDS: readonly string[] = [];
