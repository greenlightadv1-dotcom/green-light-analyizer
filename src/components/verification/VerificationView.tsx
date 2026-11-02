"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { saveVerificationDetails, startVerification, submitVerification } from "@/app/verification/actions";
import { DOCUMENTS, EDITABLE, FIELDS, missingDocuments } from "@/lib/verification/rules";
import { VERIFICATION_TONE } from "@/lib/verification/display";
import { day } from "@/lib/collab/display";
import type { ActionResult } from "@/lib/ui/action-result";
import type { AccountStatus, VerificationCase, VerificationDocType, VerificationKind } from "@/lib/types/database";
import { DocumentUploader } from "./DocumentUploader";

type CaseView = VerificationCase & { prefill: { values: Record<string, string>; missing: string[] } };
type DocView = { id: string; case_id: string; doc_type: VerificationDocType; size_bytes: number; uploaded_at: string };
type EventView = { id: number; case_id: string; event: string; created_at: string; mine: boolean };

const BTN = "inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink hover:brightness-110 focus-visible:focus-ring disabled:opacity-50";
const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring";
const INPUT = "h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg focus:border-brand-green/50 focus:outline-none";

function RemoveDoc({ id, demo }: { id: string; demo: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (demo) return setOpen(false);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/verification/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setOpen(false);
      router.refresh();
    } catch {
      setError(t("verification.uploadErrors.generic"));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-danger underline focus-visible:focus-ring">{t("verification.remove")}</button>
      <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={confirm} title={t("verification.removeTitle")} body={t("verification.removeBody")} confirmLabel={t("verification.removeConfirm")} tone="danger" pending={pending} error={error} />
    </>
  );
}

function DetailsForm({ c, demo }: { c: CaseView; demo: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveVerificationDetails, null);
  const reused = FIELDS[c.kind].some((f) => f.fromProfile && !c.details?.[f.key] && c.prefill.values[f.key]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="case_id" value={c.id} />
      {reused ? <p className="text-xs text-info">{t("verification.reused")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[c.kind].map((f) => (
          <label key={f.key} className="block text-xs font-medium text-fg-secondary">
            {t(`verification.field.${f.key}`)}{f.required ? " *" : ""}
            <input
              name={f.key}
              type={f.type === "date" ? "date" : f.type === "phone" ? "tel" : f.type === "url" ? "url" : "text"}
              defaultValue={c.prefill.values[f.key] ?? ""}
              maxLength={f.max}
              dir={f.type === "phone" || f.type === "url" || f.type === "country" ? "ltr" : "auto"}
              autoComplete={f.key === "phone" || f.key === "contact_phone" ? "tel" : f.key === "legal_name" ? "name" : "off"}
              className={`${INPUT} mt-1`}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || demo} className={GHOST}>{pending ? t("verification.saving") : t("verification.save")}</button>
        {state ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.ok ? t("verification.saved") : t(state.errorKey)}</p> : null}
      </div>
    </form>
  );
}

function CaseCard({ c, docs, events, demo }: { c: CaseView; docs: DocView[]; events: EventView[]; demo: boolean }) {
  const { t } = useTranslation();
  const editable = EDITABLE.includes(c.status);
  const missing = missingDocuments(c.kind, docs.map((d) => d.doc_type));
  return (
    <GlassPanel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{t(`verification.kind.${c.kind}`)}</h2>
        <StatusBadge tone={VERIFICATION_TONE[c.status]}>{t(`verification.status.${c.status}`)}</StatusBadge>
      </div>
      {c.status === "needs_info" && c.info_request ? (
        <div className="rounded-control border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="text-xs text-fg-muted">{t("verification.infoRequested")}</p>
          <p dir="auto" className="whitespace-pre-wrap text-fg">{c.info_request}</p>
        </div>
      ) : null}
      {c.status === "approved" ? <p className="text-sm text-success">{t("verification.approvedNote")}</p> : null}
      {(c.status === "rejected" || c.status === "approved") && c.decision_reason ? (
        <p className="text-sm text-fg-secondary"><span className="text-fg-muted">{t("verification.decisionNote")} </span><span dir="auto">{c.decision_reason}</span></p>
      ) : null}
      {c.status === "submitted" || c.status === "under_review" ? <p className="text-sm text-fg-secondary">{t("verification.reviewTime")}</p> : null}

      {editable ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">{t("verification.details")}</h3>
            <DetailsForm c={c} demo={demo} />
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">{t("verification.documents")}</h3>
            <p className="text-xs leading-relaxed text-fg-muted">{t("verification.documentsHint")}</p>
            {missing.length ? (
              <p className="text-xs text-warning">
                {t("verification.required", { list: missing.map((set) => set.map((d) => t(`verification.docType.${d}`)).join(t("verification.or"))).join(", ") })}
              </p>
            ) : null}
            <DocumentUploader caseId={c.id} types={DOCUMENTS[c.kind].allowed} demo={demo} />
          </section>
        </>
      ) : null}

      {docs.length ? (
        <ul className="divide-y divide-line rounded-control border border-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-fg">{t(`verification.docType.${d.doc_type}`)} <span className="text-xs text-fg-muted">· {Math.ceil(d.size_bytes / 1024)} KB · {day(d.uploaded_at)}</span></span>
              {editable ? <RemoveDoc id={d.id} demo={demo} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        <ConfirmActionForm
          action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : submitVerification}
          hidden={{ case_id: c.id }}
          trigger={{ labelKey: "verification.submit" }}
          triggerClassName={BTN}
          titleKey="verification.submitTitle"
          bodyKey="verification.submitBody"
          confirmKey="verification.submitConfirm"
          successKey="verification.submitted"
          className="space-y-3"
        >
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>{t("verification.consent")}</span>
          </label>
        </ConfirmActionForm>
      ) : null}

      {events.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-fg-muted">{t("verification.history")}</summary>
          <ol className="mt-2 space-y-1 text-xs text-fg-secondary">
            {events.map((e) => (
              <li key={e.id}>{day(e.created_at)} · {t(`verification.event.${e.event}`)}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </GlassPanel>
  );
}

/** The applicant's verification page. */
export function VerificationView({
  accountStatus,
  kinds,
  cases,
  documents,
  events,
  demo = false,
}: {
  accountStatus: AccountStatus;
  kinds: VerificationKind[];
  cases: CaseView[];
  documents: DocView[];
  events: EventView[];
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [startState, start, starting] = useActionState<ActionResult | null, FormData>(startVerification, null);
  const startable = kinds.filter((k) => !cases.some((c) => c.kind === k));
  // A company account is either the company or a representative of one: once
  // one of the two is started, the other is not offered.
  const offer = kinds.includes("company_kyb") && cases.length ? [] : startable;
  return (
    <>
      <SectionHeader title={t("verification.title")} description={t("verification.intro")} />
      {accountStatus === "pending_verification" ? <p className="mb-4 rounded-card border border-info/30 bg-info/10 p-4 text-sm text-fg">{t("verification.pendingBanner")} {t("verification.reviewTime")}</p> : null}
      {accountStatus === "rejected" ? <p className="mb-4 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-fg">{t("verification.rejectedBanner")}</p> : null}
      {accountStatus === "active" ? (
        <p className="mb-4 text-sm text-fg-secondary">{t("verification.activeNote")} <Link href={demo ? "/preview/dashboard" : "/dashboard"} className="underline">{t("verification.goToDashboard")}</Link></p>
      ) : null}

      {offer.length ? (
        <GlassPanel className="mb-4 flex flex-wrap gap-3 p-5">
          {offer.map((k) => (
            <form key={k} action={demo ? undefined : start}>
              <input type="hidden" name="kind" value={k} />
              <button type="submit" disabled={starting} className={GHOST}>
                {k === "company_kyb" ? t("verification.startCompany") : k === "representative" ? t("verification.startRepresentative") : `${t("verification.start")}: ${t(`verification.kind.${k}`)}`}
              </button>
            </form>
          ))}
          {startState && !startState.ok ? <p role="alert" className="basis-full text-sm text-danger">{t(startState.errorKey)}</p> : null}
        </GlassPanel>
      ) : null}

      <div className="space-y-4">
        {cases.map((c) => (
          <CaseCard key={c.id} c={c} demo={demo} docs={documents.filter((d) => d.case_id === c.id)} events={events.filter((e) => e.case_id === c.id)} />
        ))}
      </div>
      <p className="mt-4 text-xs text-fg-muted">{t("verification.noFaceCheck")}</p>
    </>
  );
}
