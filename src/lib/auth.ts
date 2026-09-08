import "server-only";

import { redirect, unstable_rethrow } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
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
  // Every route under (app) reaches this via its layout, unconditionally — so
  // a missing or broken Supabase config would otherwise 500 the whole product
  // rather than the specific integration that's degraded. The root page
  // already sends a visitor to /preview/dashboard for the same condition;
  // do the same for anyone who lands on an (app) route directly.
  if (!isSupabaseConfigured()) redirect("/preview/dashboard");

  // redirect() unwinds by throwing, so no redirect() call belongs inside this
  // try — a plain catch below would misroute it to /preview/dashboard instead
  // of wherever it was actually headed. Only collect data here; every
  // decision on what to do with it happens after the try/catch.
  let user: User | null = null;
  let profile: Profile | null = null;
  try {
    const supabase = await createClient();
    const userResult = await supabase.auth.getUser();
    user = userResult.data.user;

    if (user) {
      const profileResult = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = profileResult.data;
    }
  } catch (error) {
    // cookies() throws a framework-internal signal during static-generation
    // probing (and redirect()/notFound() do too, by design, elsewhere) — none
    // of that is a real Supabase failure, so let Next.js handle it rather
    // than misreport it as one.
    unstable_rethrow(error);

    // A genuine reachability problem (project paused, DNS, TLS, transient
    // outage) is not this request's fault. Send the visitor to the same
    // fallback as an unconfigured deployment rather than a raw 500 — it is
    // clearly labelled as a preview and holds no real data, so there is
    // nothing to leak.
    console.error("requireProfile: Supabase call failed", error);
    redirect("/preview/dashboard");
  }

  if (!user) redirect("/login");

  if (!profile) {
    // Authenticated but no profile row: the admin-created account is
    // incomplete. Don't guess a role — drop the session and send them back.
    redirect("/login?error=incomplete-account");
  }

  // §6, §12: off-platform contact exchange is a permanent ban. Enforced here
  // rather than in the proxy so it costs nothing extra — the profile row is
  // already being read — and so it holds on every authenticated render.
  if (profile.banned_at) redirect("/suspended");

  return profile;
}

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
