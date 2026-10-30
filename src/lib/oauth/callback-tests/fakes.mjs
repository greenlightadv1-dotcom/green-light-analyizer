/**
 * In-memory stand-ins for the boundaries the OAuth callback crosses (see
 * loader.mjs). They record every write so a test can assert that nothing was
 * stored, not just that the redirect looked right.
 */

export const PROFILE_ID = "creator-1";

/** @type {{ saved: unknown[], upserts: { table: string, row: unknown, options: unknown }[], stateValid: boolean }} */
export const state = { saved: [], upserts: [], stateValid: true };

export function reset() {
  state.saved = [];
  state.upserts = [];
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
  return null;
}
export async function deleteOAuthConnection() {}

// @/lib/supabase/admin
export function createAdminClient() {
  return {
    from(table) {
      return {
        async upsert(row, options) {
          state.upserts.push({ table, row, options });
          return { data: null, error: null };
        },
      };
    },
  };
}
