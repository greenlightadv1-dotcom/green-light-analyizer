import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireReviewer } from "@/lib/verification/reviewer";
import { displayNames } from "@/lib/collab/queries";
import { utcStamp } from "@/lib/ui/format";
import { VERIFICATION_TONE } from "@/lib/verification/display";

export const metadata: Metadata = { title: "Verification queue" };

const KIND = { creator_kyc: "Creator KYC", company_kyb: "Company KYB", representative: "Representative" } as const;

/**
 * Queue of verification cases, oldest submission first. Only a verification
 * reviewer sees it: RLS returns nothing to any other admin.
 */
export default async function AdminVerificationPage() {
  const { reviewer } = await requireReviewer();
  if (!reviewer) {
    return (
      <>
        <SectionHeader title="Verification queue" description="Identity and company documents are visible only to verification reviewers." />
        <GlassPanel className="p-5 text-sm text-fg-muted">You are not a verification reviewer. The owner grants review access (docs/IDENTITY_DOCUMENT_SECURITY.md).</GlassPanel>
      </>
    );
  }
  const supabase = await createClient();
  const { data: cases, error } = await supabase
    .from("verification_cases")
    .select("id, profile_id, access_request_id, kind, status, submitted_at, updated_at")
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(200);
  const names = await displayNames((cases ?? []).map((c) => c.profile_id).filter((x): x is string => !!x));
  const reqIds = (cases ?? []).map((c) => c.access_request_id).filter((x): x is string => !!x);
  const { data: reqs } = reqIds.length ? await createAdminClient().from("access_requests").select("id, full_name").in("id", reqIds) : { data: [] };
  const who = (c: { profile_id: string | null; access_request_id: string | null }) =>
    c.profile_id ? names.get(c.profile_id) ?? "—" : `${reqs?.find((r) => r.id === c.access_request_id)?.full_name ?? "—"} (application, no account yet)`;
  const open = (cases ?? []).filter((c) => c.status === "submitted" || c.status === "under_review");
  const rest = (cases ?? []).filter((c) => !open.includes(c));
  const row = (c: NonNullable<typeof cases>[number]) => (
    <li key={c.id}>
      <Link href={`/admin/verification/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-hover focus-visible:focus-ring">
        <span>
          <span className="font-medium text-fg">{who(c)}</span>
          <span className="text-fg-muted"> · {KIND[c.kind]} · {c.submitted_at ? `submitted ${utcStamp(c.submitted_at)}` : "not submitted"}</span>
        </span>
        <StatusBadge tone={VERIFICATION_TONE[c.status]}>{c.status.replace(/_/g, " ")}</StatusBadge>
      </Link>
    </li>
  );
  return (
    <>
      <SectionHeader
        title="Verification queue"
        description="Creator identity documents, company registration documents and representative authorizations. Approval records a manual document review; no face or liveness check is performed."
      />
      {error ? <GlassPanel className="mb-4 p-5 text-sm text-fg-muted">Verification is not available on this database yet. Ask the developer to apply the latest database update.</GlassPanel> : null}
      <GlassPanel className="mb-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">Waiting for review ({open.length})</h2>
        {open.length ? <ul className="divide-y divide-line">{open.map(row)}</ul> : <p className="px-5 py-4 text-sm text-fg-muted">Nothing is waiting.</p>}
      </GlassPanel>
      {rest.length ? (
        <GlassPanel className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">Other cases ({rest.length})</h2>
          <ul className="divide-y divide-line">{rest.map(row)}</ul>
        </GlassPanel>
      ) : null}
    </>
  );
}
