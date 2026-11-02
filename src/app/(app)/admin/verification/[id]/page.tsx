import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { AdminDocButton } from "@/components/verification/AdminDocButton";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayNames } from "@/lib/collab/queries";
import { utcStamp } from "@/lib/ui/format";
import { FIELDS } from "@/lib/verification/rules";
import { VERIFICATION_TONE } from "@/lib/verification/display";
import { reviewVerification } from "../actions";

export const metadata: Metadata = { title: "Verification case" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const btn = "h-9 rounded-chip px-3 text-xs font-medium focus-visible:focus-ring";
const field = "w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg";

/**
 * One case, for an admin. Documents are never embedded or linked directly:
 * each "View" issues a 5-minute signed URL and records the view.
 */
export default async function AdminVerificationCase({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("verification_cases").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: docs }, { data: events }] = await Promise.all([
    supabase.from("verification_documents").select("id, doc_type, mime, size_bytes, uploaded_at").eq("case_id", id).is("removed_at", null).order("uploaded_at"),
    supabase.from("verification_events").select("id, actor_id, event, created_at").eq("case_id", id).order("id"),
  ]);
  // Subject's account basics (service role; admin-only page).
  const { data: subject } = await createAdminClient().from("profiles").select("full_name, role, account_status, primary_email").eq("id", c.profile_id).single();
  const companies = c.kind === "representative"
    ? (await createAdminClient().from("profiles").select("id, full_name").eq("role", "company").neq("id", c.profile_id).order("full_name").limit(200)).data ?? []
    : [];
  const names = await displayNames([c.reviewed_by, ...(events ?? []).map((e) => e.actor_id)]);
  const open = c.status === "submitted" || c.status === "under_review";
  const details = (c.details ?? {}) as Record<string, string>;

  return (
    <>
      <Link href="/admin/verification" className="mb-3 inline-block text-xs text-fg-muted hover:text-fg">← Verification queue</Link>
      <SectionHeader title={subject?.full_name ?? "—"} description={`${c.kind.replace(/_/g, " ")} · account ${subject?.account_status ?? "active"} · ${subject?.primary_email ?? ""}`} action={<StatusBadge tone={VERIFICATION_TONE[c.status]}>{c.status.replace(/_/g, " ")}</StatusBadge>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <GlassPanel className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-fg">Submitted details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {FIELDS[c.kind].map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-fg-muted">{f.key.replace(/_/g, " ")}</dt>
                  <dd dir="auto" className="[overflow-wrap:anywhere] text-fg">{details[f.key] || "—"}</dd>
                </div>
              ))}
            </dl>
            {c.info_request ? <p className="mt-3 text-xs text-warning">Information requested: {c.info_request}</p> : null}
            {c.decision_reason ? <p className="mt-3 text-xs text-fg-muted">Decision note: {c.decision_reason}</p> : null}
          </GlassPanel>
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">Documents ({docs?.length ?? 0})</h2>
            <ul className="divide-y divide-line">
              {(docs ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-fg">{d.doc_type.replace(/_/g, " ")} <span className="text-xs text-fg-muted">· {d.mime} · {Math.ceil(d.size_bytes / 1024)} KB · {utcStamp(d.uploaded_at)}</span></span>
                  <AdminDocButton documentId={d.id} label="View (5-minute link)" />
                </li>
              ))}
            </ul>
          </GlassPanel>
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">History</h2>
            <ol className="divide-y divide-line text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex justify-between gap-2 px-5 py-2">
                  <span className="text-fg">{e.event.replace(/_/g, " ")} <span className="text-fg-muted">· {e.actor_id ? names.get(e.actor_id) ?? "—" : "system"}</span></span>
                  <span className="text-xs text-fg-muted">{utcStamp(e.created_at)}</span>
                </li>
              ))}
            </ol>
          </GlassPanel>
        </div>
        <GlassPanel className="h-fit space-y-4 p-5">
          <h2 className="text-sm font-semibold text-fg">Decision</h2>
          {!open ? <p className="text-sm text-fg-muted">This case is not waiting for a decision.</p> : null}
          {c.status === "submitted" ? (
            <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "start_review" }} trigger={{ labelKey: "adminVerification.startReview" }} triggerClassName={`${btn} border border-line bg-surface-muted text-fg`} titleKey="adminVerification.startReviewTitle" bodyKey="adminVerification.startReviewBody" confirmKey="adminVerification.confirm" />
          ) : null}
          {open ? (
            <>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "approve" }} trigger={{ labelKey: "adminVerification.approve" }} triggerClassName={`${btn} bg-brand-green text-ink`} titleKey="adminVerification.approveTitle" bodyKey="adminVerification.approveBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" className="space-y-2">
                {c.kind === "representative" ? (
                  <label className="block text-xs text-fg-muted">Company this person represents
                    <select name="company_id" required className={`${field} mt-1`} defaultValue="">
                      <option value="" disabled className="bg-slate-900 text-white">Choose a company account</option>
                      {companies.map((co) => <option key={co.id} value={co.id} className="bg-slate-900 text-white">{co.full_name}</option>)}
                    </select>
                  </label>
                ) : null}
                <textarea name="note" rows={2} maxLength={1000} placeholder="Note (optional)" className={field} />
              </ConfirmActionForm>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "request_info" }} trigger={{ labelKey: "adminVerification.requestInfo" }} triggerClassName={`${btn} border border-warning/40 bg-warning/10 text-warning`} titleKey="adminVerification.requestInfoTitle" bodyKey="adminVerification.requestInfoBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" className="space-y-2">
                <textarea name="note" required rows={2} maxLength={1000} placeholder="What is needed" className={field} />
              </ConfirmActionForm>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "reject" }} trigger={{ labelKey: "adminVerification.reject" }} triggerClassName={`${btn} border border-danger/40 bg-danger/10 text-danger`} titleKey="adminVerification.rejectTitle" bodyKey="adminVerification.rejectBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" tone="danger" className="space-y-2">
                <textarea name="note" required rows={2} maxLength={1000} placeholder="Reason (sent to the applicant)" className={field} />
              </ConfirmActionForm>
            </>
          ) : null}
          <p className="text-xs leading-relaxed text-fg-muted">Approval records a manual document review. It is not a biometric identity check, and the product does not call the account &quot;identity verified&quot;.</p>
          {c.reviewed_at ? <p className="text-xs text-fg-muted">Reviewed {utcStamp(c.reviewed_at)} by {c.reviewed_by ? names.get(c.reviewed_by) ?? "—" : "—"}.</p> : null}
        </GlassPanel>
      </div>
    </>
  );
}
