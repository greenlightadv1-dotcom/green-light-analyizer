/**
 * In-memory stand-ins for the boundaries the OAuth callback crosses (see
 * loader.mjs). They record every write so a test can assert that nothing was
 * stored, not just that the redirect looked right.
 */

export const PROFILE_ID = "creator-1";

/**
 * @type {{
 *   saved: unknown[],
 *   upserts: { table: string, row: unknown, options: unknown }[],
 *   updates: { table: string, row: unknown, filters: [string, unknown][] }[],
 *   deleted: { creatorId: string, platform: string }[],
 *   connection: Record<string, unknown> | null,
 *   stateValid: boolean,
 * }}
 */
export const state = { saved: [], upserts: [], updates: [], deleted: [], connection: null, stateValid: true };

export function reset() {
  state.saved = [];
  state.upserts = [];
  state.updates = [];
  state.deleted = [];
  state.connection = null;
  state.stateValid = true;
}

// @/lib/auth
export async function requireProfile() {
  return { id: PROFILE_ID, role: "creator", subscription_plan: "Pro" };
}

// @/lib/oauth/state
export function verifyOAuthState() {
  return state.stateValid;
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
