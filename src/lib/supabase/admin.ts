import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses RLS — never import this into anything that can
 * reach the browser, and never call it from a route that is not already
 * guarded by an admin check.
 *
 * It exists for exactly two jobs in the MVP:
 *   1. Admin account creation (§4 — there is no self-signup anywhere).
 *   2. Clearing the forced-password-change flag in app_metadata, which the
 *      user themselves must not be able to write.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin operations are unavailable.",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
