"use server";

import { HONEYPOT_FIELD, parseAccessRequest, type ParsedRequest } from "@/lib/access-requests";
import { log } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { clientKey } from "@/lib/client-key";
import { JOURNEY_KIND, sendResumeLink } from "@/lib/verification/application";

/** What the applicant typed, echoed back so a failed submit keeps it (React resets the form). */
export type ApplyValues = Record<(typeof ECHO)[number], string>;
const ECHO = ["full_name", "email", "company_name", "website", "primary_platform", "channel_handle", "message"] as const;
function echo(formData: FormData): ApplyValues {
  return Object.fromEntries(ECHO.map((k) => [k, String(formData.get(k) ?? "").slice(0, 1000)])) as ApplyValues;
}

export type ApplyState =
  | { status: "idle" }
  | { status: "submitted" }
  | { status: "invalid"; errors: Extract<ParsedRequest, { ok: false }>["errors"]; values: ApplyValues }
  | { status: "error"; code: "rate_limited" | "unavailable" | "email_failed"; values: ApplyValues };

/**
 * Get Started, step 1: open an application (docs/ACCOUNT_ACTIVATION_FLOW.md).
 *
 * It never creates an auth user or a profile. It writes one access_requests
 * row and one verification case through the service role, then emails a
 * one-time link that lets the applicant continue (identity details,
 * documents, submission). Nothing continues without opening that link, so
 * the applicant must control the address before anything else happens.
 *
 * Public, so it is guarded by a honeypot field, a per-address rate limit
 * (hashed client address) and server-side validation. An address that
 * already has an open application gets the same answer as a new one, and a
 * fresh link is sent to that address, so the form reveals nothing about who
 * has applied.
 */
export async function submitAccessRequest(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) return { status: "submitted" };

  const parsed = parseAccessRequest(formData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: echo(formData) };
  if (!isSupabaseConfigured()) return { status: "error", code: "unavailable", values: echo(formData) };

  const limit = await consumeRateLimit("access_request", await clientKey());
  if (!limit.allowed) return { status: "error", code: "rate_limited", values: echo(formData) };

  const service = createAdminClient();
  let requestId: string | null = null;
  const { data: inserted, error } = await service.from("access_requests").insert(parsed.value).select("id").single();
  if (inserted) {
    requestId = inserted.id;
    const { error: caseError } = await service
      .from("verification_cases")
      .insert({ access_request_id: inserted.id, kind: JOURNEY_KIND[parsed.value.journey] });
    if (caseError) {
      log.error("access_request.case_failed", { code: caseError.code, journey: parsed.value.journey });
      // No half-open application: without a case nothing can be reviewed.
      await service.from("access_requests").delete().eq("id", inserted.id);
      return { status: "error", code: "unavailable", values: echo(formData) };
    }
  } else if (error?.code === "23505") {
    // An open application for this address exists: send a new link to that address.
    const { data: existing } = await service.from("access_requests").select("id").eq("status", "pending").ilike("email", parsed.value.email).maybeSingle();
    requestId = existing?.id ?? null;
  } else {
    log.error("access_request.insert_failed", { code: error?.code ?? null, journey: parsed.value.journey });
    return { status: "error", code: "unavailable", values: echo(formData) };
  }

  if (requestId && !(await sendResumeLink(requestId, parsed.value.email))) {
    return { status: "error", code: "email_failed", values: echo(formData) };
  }
  log.info("access_request.received", { journey: parsed.value.journey, duplicate: error?.code === "23505" });
  return { status: "submitted" };
}
