"use server";

import { redirect } from "next/navigation";
import { HONEYPOT_FIELD, parseAccessRequest, roleForJourney, type ParsedRequest } from "@/lib/access-requests";
import { generateInboundAlias } from "@/lib/alias";
import { log } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { passwordProblems } from "@/lib/registration";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { clientKey } from "@/lib/client-key";
import { JOURNEY_KIND } from "@/lib/verification/application";
import { MAIN_PLATFORMS, mergeDetails } from "@/lib/verification/rules";

/** What the applicant typed, echoed back so a failed submit keeps it (React resets the form). Never the password. */
export type ApplyValues = Record<(typeof ECHO)[number], string>;
const ECHO = ["full_name", "email", "company_name", "website", "primary_platform", "channel_handle", "message"] as const;
function echo(formData: FormData): ApplyValues {
  return Object.fromEntries(ECHO.map((k) => [k, String(formData.get(k) ?? "").slice(0, 1000)])) as ApplyValues;
}

type Errors = Extract<ParsedRequest, { ok: false }>["errors"] & { password?: string; password_confirm?: string };

export type ApplyState =
  | { status: "idle" }
  | { status: "invalid"; errors: Errors; values: ApplyValues }
  | { status: "error"; code: "rate_limited" | "unavailable" | "email_taken"; values: ApplyValues };

/**
 * Get Started (owner decision, 2026-11-24): the applicant creates their own
 * account here, with their own password, and goes straight to the
 * step-by-step verification form. No emailed link at any point.
 *
 * The account starts `pending_verification`: requireProfile confines it to
 * /verification and every API answers 403 (lib/auth.ts, lib/api-session.ts)
 * until a verification reviewer approves its case, which is what makes it
 * active (verification_transition). The details it submits are locked once
 * submitted (EDITABLE in lib/verification/rules.ts) and stay locked.
 *
 * The auth user is created server-side with the service role; Supabase
 * Auth's public sign-up stays OFF, so this action is the only way in. It is
 * guarded by a honeypot, a per-address rate limit and server-side checks,
 * and rolls back the auth user if the profile or case cannot be written.
 */
export async function submitAccessRequest(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) redirect("/");

  const parsed = parseAccessRequest(formData);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");
  const errors: Errors = parsed.ok ? {} : { ...parsed.errors };
  if (passwordProblems(password).length) errors.password = "weak";
  else if (password !== confirm) errors.password_confirm = "mismatch";
  if (!parsed.ok || Object.keys(errors).length) return { status: "invalid", errors, values: echo(formData) };
  if (!isSupabaseConfigured()) return { status: "error", code: "unavailable", values: echo(formData) };

  const limit = await consumeRateLimit("access_request", await clientKey());
  if (!limit.allowed) return { status: "error", code: "rate_limited", values: echo(formData) };

  const a = parsed.value;
  const role = roleForJourney(a.journey);
  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: a.email,
    password,
    // No confirmation email: the reviewer checks identity documents before
    // the account can do anything (owner decision).
    email_confirm: true,
  });
  if (createError || !created?.user) {
    if (createError && /already|registered|exists/i.test(createError.message)) {
      return { status: "error", code: "email_taken", values: echo(formData) };
    }
    log.error("signup.create_user_failed", { error: createError });
    return { status: "error", code: "unavailable", values: echo(formData) };
  }
  const userId = created.user.id;

  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    full_name: a.full_name,
    role,
    region: "MENA",
    subscription_plan: "Starter",
    inbound_alias: role === "creator" ? generateInboundAlias(a.channel_handle || a.full_name) : null,
    primary_email: a.email,
    must_change_password: false,
    account_status: "pending_verification",
    ...(a.company_name ? { company_name: a.company_name } : {}),
    ...(a.website ? { company_website: a.website } : {}),
  });
  if (profileError) {
    log.error("signup.profile_failed", { error: profileError, journey: a.journey });
    await service.auth.admin.deleteUser(userId);
    return { status: "error", code: "unavailable", values: echo(formData) };
  }

  // What the applicant already typed pre-fills the verification steps.
  const kind = JOURNEY_KIND[a.journey];
  const known: Record<string, string> =
    kind === "creator_kyc"
      ? {
          ...((MAIN_PLATFORMS as readonly string[]).includes(a.primary_platform ?? "") ? { main_platform: a.primary_platform! } : {}),
          ...(a.channel_handle ? { handle: a.channel_handle } : {}),
        }
      : kind === "company_kyb"
        ? { ...(a.company_name ? { registered_name: a.company_name } : {}), ...(a.website ? { website: a.website } : {}) }
        : { ...(a.company_name ? { company_name: a.company_name } : {}) };
  const merged = mergeDetails(kind, {}, known);
  const { data: opened, error: caseError } = await service
    .from("verification_cases")
    .insert({ profile_id: userId, kind, details: merged.ok ? merged.value : {} })
    .select("id")
    .single();
  if (caseError || !opened) {
    log.error("signup.case_failed", { error: caseError, journey: a.journey });
    await service.from("profiles").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
    return { status: "error", code: "unavailable", values: echo(formData) };
  }
  await service.from("verification_events").insert({ case_id: opened.id, actor_id: userId, event: "created" });
  log.info("signup.created", { journey: a.journey });

  // Sign the new account in, then continue to the verification steps.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: a.email, password });
  if (signInError) {
    log.warn("signup.sign_in_failed", { error: signInError });
    redirect("/login?next=%2Fverification");
  }
  redirect("/verification");
}
