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
  request: Pick<AccessRequest, "id" | "journey" | "full_name" | "email" | "company_name" | "website" | "status">;
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
    .select("id, journey, full_name, email, company_name, website, status")
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

export async function clearApplicationCookie(): Promise<void> {
  (await cookies()).delete(APPLICATION_COOKIE);
}

/**
 * Issue a resume token and email the link to the address on the application.
 * Returns false when the token or the email could not be produced; the raw
 * token is never logged.
 */
export async function sendResumeLink(requestId: string, email: string, infoRequest: string | null = null): Promise<boolean> {
  const token = newToken();
  const service = createAdminClient();
  const { error } = await service.rpc("application_token_issue", {
    p_request: requestId, p_purpose: "resume", p_hash: token.hash, p_ttl_seconds: RESUME_TTL_SECONDS, p_actor: null,
  });
  if (error) {
    log.error("application.resume_issue_failed", { error });
    return false;
  }
  const link = `${siteUrl().replace(/\/+$/, "")}/apply/continue?token=${token.raw}`;
  const sent = await sendSystemNotification({ to: email, ...resumeEmail(link, RESUME_TTL_SECONDS / 86400, infoRequest) });
  if (!sent.ok) log.error("application.resume_email_failed", { reason: sent.error });
  return sent.ok;
}

/**
 * Issue the one-time activation link after approval and email it. The
 * database refuses unless the actor is a verification reviewer and every case
 * of the application is approved; a new link revokes any earlier one.
 */
export async function sendActivationLink(requestId: string, actorId: string): Promise<{ ok: boolean; errorKey: string | null }> {
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
    return { ok: false, errorKey: "activation.errors.email_failed" };
  }
  return { ok: true, errorKey: null };
}
