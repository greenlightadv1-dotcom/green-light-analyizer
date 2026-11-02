"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { notifyDecision } from "@/lib/verification/server";
import { verificationErrorKey } from "@/lib/verification/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Admin review of verification cases (0032). The reviewer is the session's
 * admin; verification_transition() re-checks that, refuses an admin's own
 * case, enforces the state machine and writes the history atomically.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["start_review", "request_info", "approve", "reject"] as const;

export async function reviewVerification(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const admin = await requireRole("admin");
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
  if (action === "approve" || action === "reject" || action === "request_info") {
    const { data: row } = await service.from("verification_cases").select("profile_id, kind").eq("id", caseId).single();
    if (row) await notifyDecision(row, action === "approve" ? "approved" : action === "reject" ? "rejected" : "needs_info", note);
  }
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${caseId}`);
  return OK;
}

export type ViewState = { ok: boolean; url: string | null; errorKey: string | null };

/** A 5-minute signed URL for one document, recorded in the case history. */
export async function viewVerificationDocument(_prev: ViewState | null, fd: FormData): Promise<ViewState> {
  const admin = await requireRole("admin");
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
