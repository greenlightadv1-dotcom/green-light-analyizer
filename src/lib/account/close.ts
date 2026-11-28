import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { OWNED_BUCKETS, closeAccountErrorKey, closedAccountEmail } from "./close-rules";

/**
 * True when `password` is this account's password. Checked on a throwaway
 * client that keeps no session and sets no cookie, so the caller's own
 * session is untouched; the session it opens is signed out at once.
 */
export async function passwordMatches(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const client = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await client.auth.signOut().catch(() => {});
  return true;
}

/** Every file under `<profileId>/` in a bucket, paged. */
async function removeOwnedFiles(bucket: string, profileId: string): Promise<void> {
  const storage = createAdminClient().storage.from(bucket);
  for (let page = 0; page < 20; page++) {
    const { data, error } = await storage.list(profileId, { limit: 100 });
    if (error) {
      log.error("account_close.storage_list_failed", { bucket, profile_id: profileId, error });
      return;
    }
    const paths = (data ?? []).filter((f) => f.name).map((f) => `${profileId}/${f.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await storage.remove(paths);
    if (removeError) {
      log.error("account_close.storage_remove_failed", { bucket, profile_id: profileId, error: removeError });
      return;
    }
  }
}

/**
 * Close an account (Settings → Delete account). Order matters:
 *   1. close_account() — one transaction; refuses an admin, a closed account
 *      or open agreed/disputed deals before anything is touched. Deletes the
 *      platform tokens and media kits (YouTube API data), the person's working
 *      data, and anonymises and bans the profile.
 *   2. Their own files (photo, media-kit documents). Verification images stay
 *      under the 365-day retention of Privacy §9, purged by its own job.
 *   3. The auth user: moved to an undeliverable address, metadata cleared,
 *      banned, so the old email and password no longer sign in.
 * Steps 2–3 are logged on failure for an admin to finish; the account is
 * already closed by then.
 */
export async function closeAccount(profileId: string): Promise<{ ok: true } | { ok: false; errorKey: string }> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("close_account", { p_profile: profileId });
  if (error) {
    const errorKey = closeAccountErrorKey(error.message);
    if (errorKey === "ui.errors.generic") log.error("account_close.failed", { profile_id: profileId, error });
    return { ok: false, errorKey };
  }

  for (const bucket of OWNED_BUCKETS) await removeOwnedFiles(bucket, profileId);

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    email: closedAccountEmail(profileId),
    email_confirm: true,
    user_metadata: {},
    ban_duration: "876000h",
  });
  if (authError) log.error("account_close.auth_update_failed", { profile_id: profileId, error: authError });

  log.info("account_close.done", { profile_id: profileId });
  return { ok: true };
}
