import type { Metadata } from "next";
import { VerificationView } from "@/components/verification/VerificationView";
import { prefill } from "@/lib/verification/rules";
import type { VerificationCase } from "@/lib/types/database";

export const metadata: Metadata = { title: "Verification · Preview" };

const CASE: VerificationCase = {
  id: "00000000-0000-4000-8000-000000000501",
  profile_id: "00000000-0000-4000-8000-0000000000a1",
  kind: "creator_kyc",
  status: "needs_info",
  details: { legal_name: "Amir Khaled (demo)", nationality: "EG" },
  company_profile_id: null,
  method: null,
  provider_ref: null,
  info_request: "Please upload a clearer photo of the front of your ID card.",
  decision_reason: null,
  submitted_at: "2026-11-01T10:00:00Z",
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-11-01T09:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
};

export default function PreviewVerification() {
  return (
    <VerificationView
      demo
      accountStatus="pending_verification"
      kinds={["creator_kyc"]}
      cases={[{ ...CASE, prefill: prefill("creator_kyc", CASE.details, { full_name: "Amir Khaled (demo)", country: "EG" }) }]}
      documents={[{ id: "00000000-0000-4000-8000-000000000601", case_id: CASE.id, doc_type: "id_back", size_bytes: 412000, uploaded_at: "2026-11-01T09:30:00Z" }]}
      events={[
        { id: 1, case_id: CASE.id, event: "created", created_at: "2026-11-01T09:00:00Z", mine: true },
        { id: 2, case_id: CASE.id, event: "submitted", created_at: "2026-11-01T10:00:00Z", mine: true },
        { id: 3, case_id: CASE.id, event: "info_requested", created_at: "2026-11-01T12:00:00Z", mine: false },
      ]}
    />
  );
}
