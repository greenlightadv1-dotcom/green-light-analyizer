import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSystemNotification } from "@/lib/resend";
import { siteUrl } from "@/lib/constants/site";
import { log } from "@/lib/log";
import type { AccessRequest, VerificationCase, VerificationDocument, VerificationEvent, VerificationKind } from "@/lib/types/database";
import { activationEmail, resumeEmail } from "./email";
import {
  ACTIVATION_TTL_HOURS,
  ACTIVATION_TTL_SECONDS,
  APPLICATION_COOKIE,
  RESUME_TTL_SECONDS,
  hashToken,
  isTokenShape,
  newToken,
} from "./tokens";

/**
 * The applicant's side before an account exists (docs/ACCOUNT_ACTIVATION_FLOW.md).
 *
 * An applicant has no Supabase session. They prove they own an application
 * with a resume token: a random 32-byte value emailed to the address on the
 * application and, once opened, kept in an httpOnly cookie. The database
 * holds only its hash and decides whether it is still valid. Every read and
 * write below is scoped to the application that token resolves to, never to
 * an id from a form.
 */

export const JOURNEY_KIND = { creator: "creator_kyc", company: "company_kyb", company_representative: "representative" } as const satisfies Record<AccessRequest["journey"], VerificationKind>;

export type CurrentApplication = {
  request: Pick<AccessRequest, "id" | "journey" | "full_name" | "email" | "company_name" | "website" | "status" | "primary_platform" | "channel_handle" | "email_verified_at">;
  cases: VerificationCase[];
  documents: Pick<VerificationDocument, "id" | "case_id" | "doc_type" | "size_bytes" | "uploaded_at" | "capture_method">[];
  events: Pick<VerificationEvent, "id" | "case_id" | "event" | "created_at">[];
};

/** Resolve the resume cookie to its application, or null when absent, expired, used or revoked. */
export async function currentApplication(): Promise<CurrentApplication | null> {
  const raw = (await cookies()).get(APPLICATION_COOKIE)?.value;
  if (!isTokenShape(raw)) return null;
  const service = createAdminClient();
  const { data: rows, error } = await service.rpc("application_token_lookup", { p_hash: hashToken(raw), p_purpose: "resume" });
  if (error) {
    log.error("application.lookup_failed", { error });
    return null;
  }
  const row = rows?.[0];
  if (!row || row.state !== "valid") return null;
  const { data: request } = await service
    .from("access_requests")
    .select("id, journey, full_name, email, company_name, website, status, primary_platform, channel_handle, email_verified_at")
    .eq("id", row.access_request_id)
    .maybeSingle();
  if (!request) return null;
  const { data: cases } = await service.from("verification_cases").select("*").eq("access_request_id", request.id);
  const ids = (cases ?? []).map((c) => c.id);
  const [{ data: documents }, { data: events }] = ids.length
    ? await Promise.all([
        service.from("verification_documents").select("id, case_id, doc_type, size_bytes, uploaded_at, capture_method").in("case_id", ids).is("removed_at", null).order("uploaded_at"),
        service.from("verification_events").select("id, case_id, event, created_at").in("case_id", ids).order("id").limit(100),
      ])
    : [{ data: [] }, { data: [] }];
  return { request, cases: cases ?? [], documents: documents ?? [], events: events ?? [] };
}

/** Put a resume token in the httpOnly cookie (after the applicant opened their emailed link). */
export async function setApplicationCookie(raw: string): Promise<void> {
  (await cookies()).set(APPLICATION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: RESUME_TTL_SECONDS,
  });
}

/**
 * Record that the applicant controls the address: called when a valid
 * emailed link is opened. Only the first opening is recorded (compare-and-set
 * on a null timestamp), so replays add nothing. Returns false only on a
 * database error; the applicant can then retry by opening the link again.
 */
export async function markEmailVerified(requestId: string): Promise<boolean> {
  const service = createAdminClient();
  const { data, error } = await service
    .from("access_requests")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("email_verified_at", null)
    .select("id");
  if (error) {
    // 42703: the column is absent (0039 not applied). Nothing to record, and nothing enforces it either.
    if (error.code !== "42703" && error.code !== "PGRST204") log.error("application.email_verify_failed", { error });
    return error.code === "42703" || error.code === "PGRST204";
  }
  if (data?.length) {
    const { data: cases } = await service.from("verification_cases").select("id").eq("access_request_id", requestId);
    if (cases?.length) await service.from("verification_events").insert(cases.map((c) => ({ case_id: c.id, actor_id: null, event: "email_verified" })));
  }
  return true;
}

export async function clearApplicationCookie(): Promise<void> {
  (await cookies()).delete(APPLICATION_COOKIE);
}

/**
 * Issue a resume token and email the link to the address on the application.
 * Returns false when the token or the email could not be produced; the raw
 * token is never logged.
 */
export async function sendResumeLink(requestId: string, email: string, infoRequest: string | null = null): Promise<boolean> {
  return (await issueResumeLink(requestId, email, infoRequest)) !== null;
}

/**
 * Same as sendResumeLink, and returns the raw token so Get Started can open
 * the application in this browser at once (owner decision, 2026-11-24). Only
 * for a brand-new application: a duplicate address never gets a token back,
 * or anyone could open someone else's application by typing their email.
 * Opening the emailed link is still what verifies the address, and
 * submission still requires it (verification_submit_guard).
 */
export async function issueResumeLink(requestId: string, email: string, infoRequest: string | null = null): Promise<string | null> {
  const token = newToken();
  const service = createAdminClient();
  const { error } = await service.rpc("application_token_issue", {
    p_request: requestId, p_purpose: "resume", p_hash: token.hash, p_ttl_seconds: RESUME_TTL_SECONDS, p_actor: null,
  });
  if (error) {
    log.error("application.resume_issue_failed", { error });
    return null;
  }
  const link = `${siteUrl().replace(/\/+$/, "")}/apply/continue?token=${token.raw}`;
  const sent = await sendSystemNotification({ to: email, ...resumeEmail(link, RESUME_TTL_SECONDS / 86400, infoRequest) });
  if (!sent.ok) log.error("application.resume_email_failed", { reason: sent.error });
  return sent.ok ? token.raw : null;
}

/**
 * Issue the one-time activation link after approval and email it. The
 * database refuses unless the actor is a verification reviewer and every case
 * of the application is approved; a new link revokes any earlier one.
 */
export async function sendActivationLink(requestId: string, actorId: string): Promise<{ ok: boolean; errorKey: string | null; link?: string }> {
  const service = createAdminClient();
  const { data: request } = await service.from("access_requests").select("id, email, journey").eq("id", requestId).maybeSingle();
  if (!request) return { ok: false, errorKey: "activation.errors.not_found" };
  const token = newToken();
  const { error } = await service.rpc("application_token_issue", {
    p_request: requestId, p_purpose: "activation", p_hash: token.hash, p_ttl_seconds: ACTIVATION_TTL_SECONDS, p_actor: actorId,
  });
  if (error) {
    log.warn("application.activation_issue_refused", { error });
    return { ok: false, errorKey: /activation:([a-z_]+)/.test(error.message) ? `activation.errors.${/activation:([a-z_]+)/.exec(error.message)![1]}` : "ui.errors.generic" };
  }
  const link = `${siteUrl().replace(/\/+$/, "")}/activate?token=${token.raw}`;
  const sent = await sendSystemNotification({ to: request.email, ...activationEmail(JOURNEY_KIND[request.journey], link, ACTIVATION_TTL_HOURS) });
  if (!sent.ok) {
    log.error("application.activation_email_failed", { reason: sent.error });
    // The link exists either way; the admin can still send it on WhatsApp.
    return { ok: false, errorKey: "activation.errors.email_failed", link };
  }
  return { ok: true, errorKey: null, link };
}
