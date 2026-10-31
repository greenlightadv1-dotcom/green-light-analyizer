import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

/**
 * The signed-in profile for an API route, or why there is none. Never
 * redirects: API callers get a status code. Same gates as requireProfile():
 * a banned account and one that has not replaced its temporary password
 * are refused.
 */
export async function loadApiSession(): Promise<
  { ok: true; profile: Profile } | { ok: false; status: 401 | 403 | 503; error: string }
> {
  // No database configured (e.g. a preview-only deployment): a clean 503
  // instead of the client constructor throwing a 500.
  if (!isSupabaseConfigured()) return { ok: false, status: 503, error: "unavailable" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, status: 401, error: "not_signed_in" };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (!profile) return { ok: false, status: 403, error: "no_profile" };
  if (profile.banned_at) return { ok: false, status: 403, error: "suspended" };
  if (profile.must_change_password) return { ok: false, status: 403, error: "password_reset_required" };
  return { ok: true, profile };
}
