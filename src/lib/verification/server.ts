import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSystemNotification } from "@/lib/resend";
import { log } from "@/lib/log";
import type { VerificationCase, VerificationDocument, VerificationEvent, VerificationKind } from "@/lib/types/database";
import { siteUrl } from "@/lib/constants/site";
import { decisionEmail } from "./email";

/** The caller's own cases, documents and history, read under RLS. */
export async function ownVerification(profileId: string): Promise<{ cases: VerificationCase[]; documents: VerificationDocument[]; events: VerificationEvent[] }> {
  const supabase = await createClient();
  const { data: cases } = await supabase.from("verification_cases").select("*").eq("profile_id", profileId);
  const ids = (cases ?? []).map((c) => c.id);
  if (!ids.length) return { cases: [], documents: [], events: [] };
  const [{ data: documents }, { data: events }] = await Promise.all([
    supabase.from("verification_documents").select("*").in("case_id", ids).is("removed_at", null).order("uploaded_at"),
    supabase.from("verification_events").select("*").in("case_id", ids).order("id").limit(200),
  ]);
  return { cases: cases ?? [], documents: documents ?? [], events: events ?? [] };
}

/**
 * Email the subject about a decision. Never throws and never blocks the
 * decision: a failed send is logged (the decision is already recorded).
 */
export async function notifyDecision(caseRow: { profile_id: string; kind: VerificationKind }, decision: "approved" | "rejected" | "needs_info", note: string | null): Promise<boolean> {
  try {
    const { data: p } = await createAdminClient().from("profiles").select("primary_email").eq("id", caseRow.profile_id).maybeSingle();
    if (!p?.primary_email) return false;
    const mail = decisionEmail(caseRow.kind, decision, siteUrl(), note);
    const sent = await sendSystemNotification({ to: p.primary_email, ...mail });
    if (!sent.ok) log.error("verification.email_failed", { decision, reason: sent.error });
    return sent.ok;
  } catch (error) {
    log.error("verification.email_failed", { decision, error });
    return false;
  }
}
