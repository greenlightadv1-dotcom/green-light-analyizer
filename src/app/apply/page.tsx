import type { Metadata } from "next";
import { GetStartedShell } from "@/components/get-started/GetStartedShell";
import { ApplicationLinkRequest, ApplicationView } from "@/components/apply/ApplicationView";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { currentApplication } from "@/lib/verification/application";
import { prefill } from "@/lib/verification/rules";
import { leaveApplication, requestResumeLink, saveApplicationDetails, submitApplication } from "./actions";

export const metadata: Metadata = { title: "Your application", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

const REASONS = ["expired", "invalid", "rate_limited"] as const;

/**
 * Public (session.ts PUBLIC_PATHS) but personal: the application shown is the
 * one the httpOnly resume cookie resolves to, checked by the database on
 * every request. No account exists yet.
 */
export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const app = isSupabaseConfigured() ? await currentApplication() : null;
  if (!app) {
    const reason = (REASONS as readonly string[]).includes(link ?? "") ? (link as (typeof REASONS)[number]) : "none";
    return (
      <GetStartedShell>
        <ApplicationLinkRequest reason={reason} action={requestResumeLink} />
      </GetStartedShell>
    );
  }
  const r = app.request;
  // Never ask twice: what the application already holds pre-fills the case.
  const known = r.journey === "company"
    ? { full_name: r.company_name, company_website: r.website, company_name: r.company_name }
    : { full_name: r.full_name, company_name: r.company_name };
  return (
    <GetStartedShell>
      <ApplicationView
        applicant={{ full_name: r.full_name, email: r.email, journey: r.journey, company_name: r.company_name }}
        cases={app.cases.map((c) => ({ ...c, prefill: prefill(c.kind, c.details ?? {}, known) }))}
        documents={app.documents.map((d) => ({ id: d.id, case_id: d.case_id, doc_type: d.doc_type, size_bytes: d.size_bytes, uploaded_at: d.uploaded_at }))}
        events={app.events}
        save={saveApplicationDetails}
        submit={submitApplication}
        leave={leaveApplication}
      />
    </GetStartedShell>
  );
}
