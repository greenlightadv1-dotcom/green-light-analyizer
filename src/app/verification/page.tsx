import type { Metadata } from "next";
import { VerificationView } from "@/components/verification/VerificationView";
import { GApplicantHelp } from "@/components/g/GApplicantHelp";
import { requireAnyStatusProfile } from "@/lib/auth";
import { kindsForRole, prefill } from "@/lib/verification/rules";
import { ownVerification } from "@/lib/verification/server";

export const metadata: Metadata = { title: "Verification" };

/** The applicant's own verification cases (RLS), for any account status. */
export default async function VerificationPage() {
  const profile = await requireAnyStatusProfile();
  const kinds = kindsForRole(profile.role);
  const { cases, documents, events } = await ownVerification(profile.id);
  const pending = (profile.account_status ?? "active") !== "active";
  return (
    <>
    <VerificationView
      accountStatus={profile.account_status ?? "active"}
      kinds={kinds}
      cases={cases.map((c) => ({ ...c, prefill: prefill(c.kind, c.details ?? {}, profile) }))}
      documents={documents.map((d) => ({ id: d.id, case_id: d.case_id, doc_type: d.doc_type, size_bytes: d.size_bytes, uploaded_at: d.uploaded_at }))}
      events={events.map((e) => ({ id: e.id, case_id: e.case_id, event: e.event, created_at: e.created_at }))}
    />
    {/* G for accounts awaiting verification (Phase 1E); active accounts have the full assistant. */}
    {pending ? <GApplicantHelp /> : null}
    </>
  );
}
