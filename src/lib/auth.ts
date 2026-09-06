import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database, Role } from "@/lib/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * The session's user + profile, or a redirect to /login.
 *
 * The middleware already guards these routes; this re-checks on the server for
 * every render so a page can never be built for an unauthenticated caller even
 * if the matcher is later changed.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Authenticated but no profile row: the admin-created account is
    // incomplete. Don't guess a role — drop the session and send them back.
    redirect("/login?error=incomplete-account");
  }

  return profile;
}

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
