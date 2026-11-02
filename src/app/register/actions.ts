"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { generateInboundAlias } from "@/lib/alias";
import { siteUrl } from "@/lib/constants/site";
import { JOURNEY_KIND, JOURNEY_ROLE, parseRegistration, selfSignupEnabled } from "@/lib/registration";

export type RegisterState =
  | { status: "idle" }
  | { status: "check_email" }
  | { status: "invalid"; field: string }
  | { status: "error"; code: "disabled" | "rate_limited" | "unavailable" };

/**
 * Create an account that waits for verification (lib/registration.ts).
 *
 * - Off unless SELF_SIGNUP_ENABLED=1 (an owner decision; see the module).
 * - Rate-limited per hashed client address, like the application form.
 * - New and existing addresses get the same answer, so the form cannot be
 *   used to learn who has an account.
 * - The account is created with account_status 'pending_verification' and a
 *   draft verification case; requireProfile() keeps it on /verification
 *   until an admin approves. No admin role can be chosen.
 */
export async function registerAccount(_prev: RegisterState, fd: FormData): Promise<RegisterState> {
  if (!selfSignupEnabled()) return { status: "error", code: "disabled" };
  if (!isSupabaseConfigured()) return { status: "error", code: "unavailable" };
  const parsed = parseRegistration(Object.fromEntries(fd.entries()));
  if (!parsed.ok) return { status: "invalid", field: parsed.field };
  const v = parsed.value;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const limit = await consumeRateLimit("access_request", `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`);
  if (!limit.allowed) return { status: "error", code: "rate_limited" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm`, data: { full_name: v.full_name } },
  });
  if (error) {
    log.warn("register.sign_up_failed", { code: error.code ?? null, status: error.status ?? null });
    return { status: "error", code: "unavailable" };
  }
  // An address that already has an account comes back with no identities.
  if (!data.user || !data.user.identities?.length) return { status: "check_email" };

  const role = JOURNEY_ROLE[v.journey];
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: v.full_name,
    role,
    primary_email: v.email,
    inbound_alias: role === "creator" ? generateInboundAlias(v.full_name) : null,
    must_change_password: false,
    account_status: "pending_verification",
  });
  if (profileError) {
    // Never leave an auth user that has no profile.
    await admin.auth.admin.deleteUser(data.user.id);
    log.error("register.profile_failed", { error: profileError });
    return { status: "error", code: "unavailable" };
  }
  const { data: kase } = await admin.from("verification_cases").insert({ profile_id: data.user.id, kind: JOURNEY_KIND[v.journey] }).select("id").single();
  if (kase) await admin.from("verification_events").insert({ case_id: kase.id, actor_id: data.user.id, event: "created" });
  log.info("register.account_created", { journey: v.journey });
  return { status: "check_email" };
}
