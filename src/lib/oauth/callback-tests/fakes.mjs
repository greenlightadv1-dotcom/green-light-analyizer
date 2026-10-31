/**
 * In-memory stand-ins for the boundaries the OAuth callback crosses (see
 * loader.mjs). They record every write so a test can assert that nothing was
 * stored, not just that the redirect looked right.
 */

export const PROFILE_ID = "creator-1";

/** The session requireProfile() returns; a test may swap it per case. */
export const DEFAULT_PROFILE = { id: PROFILE_ID, role: "creator", subscription_plan: "Pro" };

/**
 * @type {{
 *   saved: unknown[],
 *   upserts: { table: string, row: unknown, options: unknown }[],
 *   updates: { table: string, row: unknown, filters: [string, unknown][] }[],
 *   deleted: { creatorId: string, platform: string }[],
 *   connection: Record<string, unknown> | null,
 *   stateValid: boolean,
 *   profile: Record<string, unknown>,
 * }}
 */
export const state = {
  saved: [],
  upserts: [],
  updates: [],
  deleted: [],
  connection: null,
  stateValid: true,
  profile: DEFAULT_PROFILE,
};

export function reset() {
  state.saved = [];
  state.upserts = [];
  state.updates = [];
  state.deleted = [];
  state.connection = null;
  state.stateValid = true;
  state.profile = DEFAULT_PROFILE;
}

// @/lib/auth
export async function requireProfile() {
  return state.profile;
}

// @/lib/oauth/state
export function verifyOAuthState() {
  return state.stateValid;
}
export function signOAuthState(profileId) {
  return `signed-state-for-${profileId}`;
}

// @/lib/oauth/tokens
export async function saveOAuthTokens(creatorId, platform, tokens) {
  state.saved.push({ creatorId, platform, tokens });
}
export async function getOAuthConnection() {
  return state.connection;
}
export async function deleteOAuthConnection(creatorId, platform) {
  state.deleted.push({ creatorId, platform });
}

// @/lib/supabase/admin
export function createAdminClient() {
  return {
    from(table) {
      return {
        async upsert(row, options) {
          state.upserts.push({ table, row, options });
          return { data: null, error: null };
        },
        update(row) {
          const entry = { table, row, filters: [] };
          state.updates.push(entry);
          const chain = {
            eq(column, value) {
              entry.filters.push([column, value]);
              return chain;
            },
            then(resolve) {
              resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}
