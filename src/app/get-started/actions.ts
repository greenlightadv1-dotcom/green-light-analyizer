"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { HONEYPOT_FIELD, parseAccessRequest, type ParsedRequest } from "@/lib/access-requests";
import { log } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";

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
  | { status: "error"; code: "rate_limited" | "unavailable"; values: ApplyValues };

/**
 * Get Started — submit an application (features 1 and 2).
 *
 * Public, so it is guarded three ways: a honeypot field, a per-address rate
 * limit (keyed by a hash of the client address, never the address itself),
 * and server-side validation of every field. It writes one row to
 * access_requests through the service role; it never creates an auth user or
 * a profile. A repeat application for an address already in the queue gets
 * the same answer as a new one, so the form reveals nothing about who has
 * applied.
 */
export async function submitAccessRequest(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) return { status: "submitted" };

  const parsed = parseAccessRequest(formData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: echo(formData) };
  if (!isSupabaseConfigured()) return { status: "error", code: "unavailable", values: echo(formData) };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const subject = `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  const limit = await consumeRateLimit("access_request", subject);
  if (!limit.allowed) return { status: "error", code: "rate_limited", values: echo(formData) };

  const { error } = await createAdminClient().from("access_requests").insert(parsed.value);
  if (error && error.code !== "23505") {
    // 42P01: the 0024 table does not exist yet on this database.
    log.error("access_request.insert_failed", { code: error.code, journey: parsed.value.journey });
    return { status: "error", code: "unavailable", values: echo(formData) };
  }
  log.info("access_request.received", { journey: parsed.value.journey, duplicate: error?.code === "23505" });
  return { status: "submitted" };
}
