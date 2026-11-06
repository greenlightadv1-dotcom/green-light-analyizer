import type { Metadata } from "next";
import { ApplicationView } from "@/components/apply/ApplicationView";
import { prefill } from "@/lib/verification/rules";
import type { VerificationCase } from "@/lib/types/database";

export const metadata: Metadata = { title: "Application · Preview" };

const CASE: VerificationCase = {
  id: "00000000-0000-4000-8000-000000000511",
  profile_id: null,
  access_request_id: "00000000-0000-4000-8000-000000000711",
  kind: "creator_kyc",
  status: "draft",
  details: { nationality: "EG" },
  company_profile_id: null,
  method: null,
  provider_ref: null,
  info_request: null,
  decision_reason: null,
  submitted_at: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-11-02T09:00:00Z",
  updated_at: "2026-11-02T09:00:00Z",
};

/** Demo data only: a creator application before any account exists. Camera capture works; nothing is uploaded. */
export default function PreviewApply() {
  async function demoAction() {
    "use server";
    return { ok: false as const, errorKey: "g.proposal.demo" };
  }
  return (
    <ApplicationView
      demo
      applicant={{ full_name: "Amir Khaled (demo)", email: "amir.demo@example.com", journey: "creator", company_name: null }}
      cases={[{ ...CASE, prefill: prefill("creator_kyc", CASE.details, { full_name: "Amir Khaled (demo)" }) }]}
      documents={[{ id: "00000000-0000-4000-8000-000000000611", case_id: CASE.id, doc_type: "id_front", size_bytes: 412000, uploaded_at: "2026-11-02T09:30:00Z" }]}
      events={[{ id: 1, case_id: CASE.id, event: "created", created_at: "2026-11-02T09:00:00Z" }]}
      save={demoAction}
      submit={demoAction}
    />
  );
}
