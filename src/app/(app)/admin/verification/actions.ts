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

export async function reviewVerification(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { admin, reviewer } = await requireReviewer();
  if (!reviewer) return fail("adminVerification.notReviewer");
  const caseId = String(fd.get("case_id") ?? "");
  const action = String(fd.get("action") ?? "") as (typeof ACTIONS)[number];
  if (!UUID.test(caseId) || !ACTIONS.includes(action)) return fail("ui.errors.invalid");
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000) || null;
  const company = String(fd.get("company_id") ?? "");
  const service = createAdminClient();
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
