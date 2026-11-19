import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { AdminDocButton } from "@/components/verification/AdminDocButton";
import { requireReviewer } from "@/lib/verification/reviewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayNames } from "@/lib/collab/queries";
import { utcStamp } from "@/lib/ui/format";
import { FIELDS, missingDocuments, missingFields } from "@/lib/verification/rules";
import { duplicateKeys } from "@/lib/verification/duplicates";
import { VERIFICATION_TONE } from "@/lib/verification/display";
import { addInternalNote, flagForEnhancedReview, resendActivation, reviewVerification } from "../actions";

export const metadata: Metadata = { title: "Verification case" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const btn = "h-9 rounded-chip px-3 text-xs font-medium focus-visible:focus-ring";
const field = "w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg";

/**
 * One case, for an admin. Documents are never embedded or linked directly:
 * each "View" issues a 5-minute signed URL and records the view.
 */
export default async function AdminVerificationCase({ params }: { params: Promise<{ id: string }> }) {
  const { reviewer } = await requireReviewer();
  if (!reviewer) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("verification_cases").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: docs }, { data: events }] = await Promise.all([
    supabase.from("verification_documents").select("id, doc_type, mime, size_bytes, uploaded_at, capture_method").eq("case_id", id).is("removed_at", null).order("uploaded_at"),
    supabase.from("verification_events").select("id, actor_id, event, created_at").eq("case_id", id).order("id"),
  ]);
  // The subject: an existing account, or an application with no account yet (service role; reviewer-only page).
  const service = createAdminClient();
  const { data: account } = c.profile_id
    ? await service.from("profiles").select("full_name, role, account_status, primary_email").eq("id", c.profile_id).single()
    : { data: null };
  const { data: application } = c.access_request_id
    ? await service.from("access_requests").select("full_name, email, journey, company_name, website, primary_platform, channel_handle, status, email_verified_at").eq("id", c.access_request_id).single()
    : { data: null };
  const subject = account
    ? { full_name: account.full_name, line: `account ${account.account_status ?? "active"} · ${account.primary_email}` }
    : { full_name: application?.full_name ?? "—", line: `application (no account yet) · ${application?.email ?? ""}${application?.company_name ? ` · ${application.company_name}` : ""}` };
  const companies = c.kind === "representative"
    ? (await service.from("profiles").select("id, full_name").eq("role", "company").order("full_name").limit(200)).data?.filter((co) => co.id !== c.profile_id) ?? []
    : [];
  const awaitingActivation = c.status === "approved" && !c.profile_id && !!c.access_request_id;
  const names = await displayNames([c.reviewed_by, ...(events ?? []).map((e) => e.actor_id)]);
  const open = c.status === "submitted" || c.status === "under_review";
  const details = (c.details ?? {}) as Record<string, string>;

  // Duplicate-identity signals (reviewer-only): other cases holding the same
  // identifying values, and other applications from the same address.
  const keys = duplicateKeys(c.kind, details);
  const dupes = await Promise.all(keys.map(async (k) => {
    let q = service.from("verification_cases").select("id, kind, status").neq("id", c.id).limit(10);
    for (const [field, value] of Object.entries(k.match)) q = q.eq(`details->>${field}`, value);
    const { data } = await q;
    return { label: k.label, cases: data ?? [] };
  }));
  const subjectEmail = account?.primary_email ?? application?.email ?? null;
  const { data: sameEmail } = subjectEmail
    ? await service.from("access_requests").select("id, status, created_at").ilike("email", subjectEmail).neq("id", c.access_request_id ?? "00000000-0000-0000-0000-000000000000").limit(10)
    : { data: [] };
  const signals = dupes.filter((d) => d.cases.length);

  // Internal notes and enhanced-review flags (0040), read under RLS with the
  // reviewer's own session: the database returns them only to reviewers, and
  // never to the subject of the case.
  const flagEmail = subjectEmail?.toLowerCase() ?? null;
  const [{ data: internalNotes }, { data: flags }] = await Promise.all([
    supabase.from("verification_notes").select("id, author_id, body, kind, created_at").eq("case_id", id).order("id"),
    flagEmail
      ? supabase.from("verification_flags").select("id, case_id, reason, raised_by, raised_at").or(`case_id.eq.${id},subject_email.eq.${flagEmail}`).order("raised_at")
      : supabase.from("verification_flags").select("id, case_id, reason, raised_by, raised_at").eq("case_id", id),
  ]);
  const noteNames = await displayNames([...(internalNotes ?? []).map((n) => n.author_id), ...(flags ?? []).map((f) => f.raised_by)]);
  const enhanced = (flags ?? []).length > 0;
  const stillMissing = {
    fields: missingFields(c.kind, details),
    docs: missingDocuments(c.kind, (docs ?? []).map((d) => d.doc_type), { application: !!c.access_request_id && !c.profile_id }),
  };

  return (
    <>
      <Link href="/admin/verification" className="mb-3 inline-block text-xs text-fg-muted hover:text-fg">← Verification queue</Link>
      <SectionHeader title={subject.full_name} description={`${c.kind.replace(/_/g, " ")} · ${subject.line}`} action={<StatusBadge tone={VERIFICATION_TONE[c.status]}>{c.status.replace(/_/g, " ")}</StatusBadge>} />
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
            {c.decision_reason ? <p className="mt-3 text-xs text-fg-muted">Decision note (shown to the applicant): {c.decision_reason}</p> : null}
            {stillMissing.fields.length || stillMissing.docs.length ? (
              <p className="mt-3 text-xs text-warning">Still missing: {[...stillMissing.fields, ...stillMissing.docs.map((set) => set.join(" or "))].map((x) => x.replace(/_/g, " ")).join(", ")}</p>
            ) : null}
          </GlassPanel>
          <GlassPanel className="space-y-2 p-5 text-sm">
            <h2 className="text-sm font-semibold text-fg">Trust checks</h2>
            {application ? (
              <p className={application.email_verified_at ? "text-success" : "text-warning"}>
                {application.email_verified_at ? `Email verified ${utcStamp(application.email_verified_at)} (applicant opened the emailed link).` : "Email not verified: the applicant has not opened an emailed link. Submission is refused until they do."}
              </p>
            ) : (
              <p className="text-fg-secondary">Existing account: the email is the account&apos;s sign-in address.</p>
            )}
            <p className="text-fg-secondary">WhatsApp number: collected for contact only. It has <strong>not</strong> been verified (no OTP or SMS in this phase).</p>
            {c.kind === "representative" ? (
              <p className="text-fg-secondary">The company name the applicant typed (&quot;<span dir="auto">{details.company_name || application?.company_name || "—"}</span>&quot;) grants nothing. Approval links this person only to the company account you choose below, after checking the authorization letter; the company then decides what they may see.</p>
            ) : null}
            {signals.length || (sameEmail ?? []).length ? (
              <div className="rounded-control border border-warning/40 bg-warning/10 p-3 text-xs text-fg">
                <p className="font-semibold">Possible duplicates (signals, not proof)</p>
                <ul className="mt-1 list-disc space-y-1 ps-4">
                  {signals.map((d) => (
                    <li key={d.label}>
                      Same {d.label.replace(/_/g, " ")} as: {d.cases.map((o, i) => <span key={o.id}>{i ? ", " : ""}<Link className="underline" href={`/admin/verification/${o.id}`}>{o.kind.replace(/_/g, " ")} ({o.status.replace(/_/g, " ")})</Link></span>)}
                    </li>
                  ))}
                  {(sameEmail ?? []).length ? <li>{(sameEmail ?? []).length} other application(s) from the same email address ({(sameEmail ?? []).map((a) => a.status).join(", ")}).</li> : null}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-fg-muted">No other case shares this phone number{c.kind === "creator_kyc" ? ", name and date of birth" : c.kind === "company_kyb" ? ", registration or tax number" : ""}, and no other application uses this email.</p>
            )}
          </GlassPanel>
          {enhanced ? (
            <GlassPanel className="space-y-2 border-danger/40 bg-danger/5 p-5 text-sm">
              <h2 className="text-sm font-semibold text-fg">Enhanced review required</h2>
              <ul className="list-disc space-y-1 ps-4 text-fg-secondary">
                {(flags ?? []).map((f) => (
                  <li key={f.id}>
                    {f.reason.replace(/_/g, " ")} · {f.case_id === id ? "this case" : <Link className="underline" href={`/admin/verification/${f.case_id}`}>an earlier case from the same email</Link>} · {f.raised_by ? noteNames.get(f.raised_by) ?? "—" : "—"} · {utcStamp(f.raised_at)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-fg-muted">A flag decides nothing and the applicant is not told. To approve, write an internal note justifying the decision first (or in the approval form). Rejecting or requesting information needs no extra step.</p>
            </GlassPanel>
          ) : null}
          <GlassPanel className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-fg">Internal notes</h2>
              <span className="rounded-chip border border-line px-2 py-0.5 text-xs text-fg-muted">Reviewers only · never shown or sent to the applicant</span>
            </div>
            {(internalNotes ?? []).length ? (
              <ol className="divide-y divide-line text-sm">
                {(internalNotes ?? []).map((n) => (
                  <li key={n.id} className="space-y-1 px-5 py-3">
                    <p className="text-xs text-fg-muted">{n.author_id ? noteNames.get(n.author_id) ?? "—" : "—"} · {utcStamp(n.created_at)}{n.kind === "flag_reason" ? " · flag explanation" : ""}</p>
                    <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{n.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-3 text-sm text-fg-muted">No internal notes yet.</p>
            )}
            <div className="space-y-4 border-t border-line px-5 py-4">
              <ConfirmActionForm action={addInternalNote} hidden={{ case_id: c.id }} trigger={{ labelKey: "adminVerification.addInternalNote" }} triggerClassName={`${btn} border border-line bg-surface-muted text-fg`} titleKey="adminVerification.addInternalNoteTitle" bodyKey="adminVerification.addInternalNoteBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" className="space-y-2">
                <textarea name="internal_note" required rows={2} maxLength={2000} placeholder="Internal note (reviewers only)" className={field} />
              </ConfirmActionForm>
              <ConfirmActionForm action={flagForEnhancedReview} hidden={{ case_id: c.id }} trigger={{ labelKey: "adminVerification.flag" }} triggerClassName={`${btn} border border-danger/40 bg-danger/10 text-danger`} titleKey="adminVerification.flagTitle" bodyKey="adminVerification.flagBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" tone="danger" className="space-y-2">
                <label className="block text-xs text-fg-muted">Reason
                  <select name="reason" required defaultValue="" className={`${field} mt-1`}>
                    <option value="" disabled className="bg-surface text-fg">Choose</option>
                    <option value="suspected_fraud" className="bg-surface text-fg">Suspected fraud</option>
                    <option value="identity_forgery" className="bg-surface text-fg">Identity forgery</option>
                    <option value="impersonation" className="bg-surface text-fg">Impersonation</option>
                  </select>
                </label>
                <textarea name="internal_note" required rows={2} maxLength={2000} placeholder="What you observed (internal, reviewers only)" className={field} />
              </ConfirmActionForm>
            </div>
          </GlassPanel>
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-4 text-base font-semibold text-fg">Documents ({docs?.length ?? 0})</h2>
            <ul className="divide-y divide-line">
              {(docs ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-fg">{d.doc_type.replace(/_/g, " ")} <span className="text-xs text-fg-muted">· {d.capture_method === "camera" ? "in-page camera capture" : "uploaded file"} · {d.mime} · {Math.ceil(d.size_bytes / 1024)} KB · {utcStamp(d.uploaded_at)}</span></span>
                  <AdminDocButton documentId={d.id} label="View (5-minute link)" />
                </li>
              ))}
            </ul>
          </GlassPanel>
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-4 text-base font-semibold text-fg">History</h2>
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
          <h2 className="text-base font-semibold text-fg">Decision</h2>
          {!open ? <p className="text-sm text-fg-muted">This case is not waiting for a decision.</p> : null}
          {awaitingActivation ? (
            <div className="space-y-2 rounded-control border border-info/30 bg-info/10 p-3 text-xs text-fg">
              <p>Approved. The applicant was emailed a one-time link to create the account; no account exists until they use it.</p>
              <ConfirmActionForm action={resendActivation} hidden={{ case_id: c.id }} trigger={{ labelKey: "adminVerification.resendActivation" }} triggerClassName={`${btn} border border-line bg-surface-muted text-fg`} titleKey="adminVerification.resendTitle" bodyKey="adminVerification.resendBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" />
            </div>
          ) : null}
          {c.status === "submitted" ? (
            <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "start_review" }} trigger={{ labelKey: "adminVerification.startReview" }} triggerClassName={`${btn} border border-line bg-surface-muted text-fg`} titleKey="adminVerification.startReviewTitle" bodyKey="adminVerification.startReviewBody" confirmKey="adminVerification.confirm" />
          ) : null}
          {open ? (
            <>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "approve" }} trigger={{ labelKey: "adminVerification.approve" }} triggerClassName={`${btn} bg-brand-green text-ink`} titleKey="adminVerification.approveTitle" bodyKey="adminVerification.approveBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" className="space-y-2">
                {c.kind === "representative" ? (
                  <label className="block text-xs text-fg-muted">Company this person represents
                    <select name="company_id" required className={`${field} mt-1`} defaultValue="">
                      <option value="" disabled className="bg-surface text-fg">Choose a company account</option>
                      {companies.map((co) => <option key={co.id} value={co.id} className="bg-surface text-fg">{co.full_name}</option>)}
                    </select>
                  </label>
                ) : null}
                <textarea name="note" rows={2} maxLength={1000} placeholder="Note to the applicant (optional, shown to them)" className={field} />
                <textarea name="internal_note" rows={2} maxLength={2000} required={enhanced} placeholder={enhanced ? "Internal justification (required: this case is under enhanced review)" : "Internal note (optional, reviewers only)"} className={field} />
              </ConfirmActionForm>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "request_info" }} trigger={{ labelKey: "adminVerification.requestInfo" }} triggerClassName={`${btn} border border-warning/40 bg-warning/10 text-warning`} titleKey="adminVerification.requestInfoTitle" bodyKey="adminVerification.requestInfoBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" className="space-y-2">
                <textarea name="note" required rows={2} maxLength={1000} placeholder="Exactly what is needed (shown to the applicant)" className={field} />
                <textarea name="internal_note" rows={2} maxLength={2000} placeholder="Internal note (optional, reviewers only)" className={field} />
              </ConfirmActionForm>
              <ConfirmActionForm action={reviewVerification} hidden={{ case_id: c.id, action: "reject" }} trigger={{ labelKey: "adminVerification.reject" }} triggerClassName={`${btn} border border-danger/40 bg-danger/10 text-danger`} titleKey="adminVerification.rejectTitle" bodyKey="adminVerification.rejectBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" tone="danger" className="space-y-2">
                <textarea name="note" required rows={2} maxLength={1000} placeholder="Reason (shown and sent to the applicant)" className={field} />
                <textarea name="internal_note" rows={2} maxLength={2000} placeholder="Internal note (optional, reviewers only)" className={field} />
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
