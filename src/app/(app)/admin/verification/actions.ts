"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { notifyDecision } from "@/lib/verification/server";
import { sendActivationLink, sendResumeLink } from "@/lib/verification/application";
import { requireReviewer } from "@/lib/verification/reviewer";
import { decisionEmail } from "@/lib/verification/email";
import { sendSystemNotification } from "@/lib/resend";
import { siteUrl } from "@/lib/constants/site";
import { verificationErrorKey } from "@/lib/verification/rules";
import { activationWhatsAppText, whatsappDigits } from "@/lib/verification/whatsapp";
import { carryOverPublicProfile } from "@/lib/verification/carry-over";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Review of verification cases (0032). Only a verification reviewer (an admin
 * the owner granted review to) may act; verification_transition() re-checks
 * that, refuses a reviewer's own case, enforces the state machine and writes
 * the history atomically.
 *
 * Approving an APPLICATION (no account yet) emails a one-time activation
 * link; the account is created only when the applicant uses it. Approving an
 * existing account's case activates it directly, as before.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["start_review", "request_info", "approve", "reject"] as const;
const FLAG_REASONS = ["suspected_fraud", "identity_forgery", "impersonation"] as const;

/**
 * Two kinds of reviewer text, never mixed (0040):
 * - `note` (applicant-facing): stored on the case as info_request /
 *   decision_reason, shown to the applicant and sent in their email.
 * - `internal_note` (reviewers only): written ONLY through
 *   verification_add_note() into verification_notes, which the applicant can
 *   never read (RLS) and which is never emailed, logged or put in history.
 */
async function addInternal(actorId: string, caseId: string, body: string): Promise<string | null> {
  const { error } = await createAdminClient().rpc("verification_add_note", { p_actor: actorId, p_case: caseId, p_body: body });
  if (!error) return null;
  const key = verificationErrorKey(error.message);
  if (key === "ui.errors.generic") log.error("verification.note_failed", { error });
  return key;
}

export async function reviewVerification(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return fail("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  const action = String(fd.get("action") ?? "") as (typeof ACTIONS)[number];
  if (!UUID.test(caseId) || !ACTIONS.includes(action)) return fail("ui.errors.invalid");
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000) || null;
  const company = String(fd.get("company_id") ?? "");
  // Written first, so it can be the justification an enhanced-review approval needs.
  const internal = String(fd.get("internal_note") ?? "").trim().slice(0, 2000);
  const service = createAdminClient();
  if (action === "approve") {
    // 0041: a case with applicable fraud flags needs an independent second
    // reviewer with their own justification. Refused here before anything is
    // written; the database enforces the same rule on every path regardless.
    const { data: state } = await service.rpc("verification_enhanced_review_state", { p_case: caseId });
    const flags = state?.[0];
    if (flags && flags.flag_count > 0) {
      if (flags.raised_by.includes(admin.id)) return fail("verification.errors.second_reviewer_required");
      if (!internal) {
        const { count } = await service
          .from("verification_notes")
          .select("id", { count: "exact", head: true })
          .eq("case_id", caseId)
          .eq("author_id", admin.id)
          .eq("kind", "note")
          .gt("created_at", flags.latest_flag_at ?? "1970-01-01");
        if (!count) return fail("verification.errors.enhanced_review_note_required");
      }
    }
  }
  if (internal) {
    const noteError = await addInternal(admin.id, caseId, internal);
    if (noteError) return fail(noteError);
  }
  const { error } = await service.rpc("verification_transition", {
    p_actor: admin.id,
    p_case: caseId,
    p_action: action,
    p_note: note,
    p_company: UUID.test(company) ? company : null,
  });
  if (error) {
    const key = verificationErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("verification.review_failed", { action, error });
    return fail(key);
  }
  const { data: row } = await service.from("verification_cases").select("profile_id, access_request_id, kind").eq("id", caseId).single();
  let emailed = true;
  if (row && row.profile_id === null && row.access_request_id) {
    const { data: req } = await service.from("access_requests").select("email").eq("id", row.access_request_id).single();
    if (action === "approve") emailed = (await sendActivationLink(row.access_request_id, admin.id)).ok;
    else if (action === "request_info" && req) emailed = await sendResumeLink(row.access_request_id, req.email, note);
    else if (action === "reject" && req) {
      const mail = decisionEmail(row.kind, "rejected", siteUrl(), note);
      emailed = (await sendSystemNotification({ to: req.email, ...mail, ctaUrl: `${siteUrl().replace(/\/+$/, "")}/get-started` })).ok;
    }
  } else if (row && row.profile_id && (action === "approve" || action === "reject" || action === "request_info")) {
    // An account that signed up on Get Started: its public photo, handle and
    // categories move onto the profile when it is approved.
    if (action === "approve" && row.kind === "creator_kyc") await carryOverPublicProfile(row.profile_id, { caseId });
    emailed = await notifyDecision({ profile_id: row.profile_id, kind: row.kind }, action === "approve" ? "approved" : action === "reject" ? "rejected" : "needs_info", note);
  }
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${caseId}`);
  // The decision is recorded either way; say so if the email did not go out.
  return emailed ? OK : fail("adminVerification.emailFailed");
}

/** Send a new one-time activation link (the earlier one stops working). */
export async function resendActivation(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return fail("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  if (!UUID.test(caseId)) return fail("ui.errors.invalid");
  const { data: row } = await createAdminClient().from("verification_cases").select("access_request_id, profile_id").eq("id", caseId).maybeSingle();
  if (!row?.access_request_id || row.profile_id) return fail("activation.errors.already_activated");
  const r = await sendActivationLink(row.access_request_id, admin.id);
  revalidatePath(`/admin/verification/${caseId}`);
  return r.ok ? OK : fail(r.errorKey ?? "ui.errors.generic");
}

export type ViewState = { ok: boolean; url: string | null; errorKey: string | null };

/** A 5-minute signed URL for one document, for a reviewer only, recorded in the case history. */
export async function viewVerificationDocument(_prev: ViewState | null, fd: FormData): Promise<ViewState> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return { ok: false, url: null, errorKey: "adminVerification.notReviewer" };
  const id = String(fd.get("document_id") ?? "");
  if (!UUID.test(id)) return { ok: false, url: null, errorKey: "ui.errors.invalid" };
  const service = createAdminClient();
  const { data: doc } = await service.from("verification_documents").select("id, case_id, storage_path, doc_type").eq("id", id).is("removed_at", null).maybeSingle();
  if (!doc) return { ok: false, url: null, errorKey: "verification.errors.not_found" };
  const { data, error } = await service.storage.from("verification-docs").createSignedUrl(doc.storage_path, 300);
  if (error || !data?.signedUrl) {
    log.error("verification.signed_url_failed", { error });
    return { ok: false, url: null, errorKey: "ui.errors.generic" };
  }
  await service.from("verification_events").insert({ case_id: doc.case_id, actor_id: admin.id, event: "document_viewed", detail: { doc_type: doc.doc_type } });
  return { ok: true, url: data.signedUrl, errorKey: null };
}

/** Add an internal note (reviewers only; the applicant never sees it). */
export async function addInternalNote(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return fail("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  const body = String(fd.get("internal_note") ?? "").trim().slice(0, 2000);
  if (!UUID.test(caseId)) return fail("ui.errors.invalid");
  if (!body) return fail("verification.errors.note_required");
  const key = await addInternal(admin.id, caseId, body);
  if (key) return fail(key);
  revalidatePath(`/admin/verification/${caseId}`);
  return OK;
}

/**
 * Flag a case for enhanced review (suspected fraud, identity forgery or
 * impersonation). It decides nothing: the case keeps its status, the
 * applicant is not told, and approving this case or any later case from the
 * same email then needs an internal justification note (enforced in the
 * database). The explanation is stored as an internal note.
 */
export async function flagForEnhancedReview(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return fail("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  const reason = String(fd.get("reason") ?? "") as (typeof FLAG_REASONS)[number];
  const body = String(fd.get("internal_note") ?? "").trim().slice(0, 2000);
  if (!UUID.test(caseId) || !FLAG_REASONS.includes(reason)) return fail("ui.errors.invalid");
  if (!body) return fail("verification.errors.note_required");
  const { error } = await createAdminClient().rpc("verification_flag", { p_actor: admin.id, p_case: caseId, p_reason: reason, p_note: body });
  if (error) {
    const key = verificationErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("verification.flag_failed", { error });
    return fail(key);
  }
  log.info("verification.flagged", { reason });
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${caseId}`);
  return OK;
}

export type WhatsAppActivationState = { ok: boolean; url: string | null; link: string | null; errorKey: string | null };

/**
 * Issue a fresh one-time activation link, email it, and hand it back so the
 * reviewer can also send it on WhatsApp (owner decision, 2026-11-24). The
 * email and the WhatsApp message carry the same link; any earlier link stops
 * working. Nothing is sent from our side on WhatsApp: the reviewer's own
 * WhatsApp opens with the message ready (wa.me), and they press send.
 */
export async function activationForWhatsApp(_prev: WhatsAppActivationState | null, fd: FormData): Promise<WhatsAppActivationState> {
  const none = (errorKey: string): WhatsAppActivationState => ({ ok: false, url: null, link: null, errorKey });
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return none("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  if (!UUID.test(caseId)) return none("ui.errors.invalid");
  const { data: row } = await createAdminClient().from("verification_cases").select("access_request_id, profile_id, details").eq("id", caseId).maybeSingle();
  if (!row?.access_request_id || row.profile_id) return none("activation.errors.already_activated");
  const r = await sendActivationLink(row.access_request_id, admin.id);
  revalidatePath(`/admin/verification/${caseId}`);
  if (!r.link) return none(r.errorKey ?? "ui.errors.generic");
  const details = (row.details ?? {}) as Record<string, unknown>;
  const phone = whatsappDigits(details.phone ?? details.contact_phone);
  const text = activationWhatsAppText(r.link);
  return { ok: true, link: r.link, url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null, errorKey: null };
}
