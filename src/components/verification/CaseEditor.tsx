"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DOCUMENTS, EDITABLE, FIELDS, missingDocuments } from "@/lib/verification/rules";
import { VERIFICATION_TONE } from "@/lib/verification/display";
import { isCameraDocType } from "@/lib/verification/camera";
import { day } from "@/lib/collab/display";
import type { ActionResult } from "@/lib/ui/action-result";
import type { VerificationCase, VerificationDocType } from "@/lib/types/database";
import { CameraCapture } from "./CameraCapture";
import { DocumentUploader } from "./DocumentUploader";

export type CaseView = VerificationCase & { prefill: { values: Record<string, string>; missing: string[] } };
export type DocView = { id: string; case_id: string; doc_type: VerificationDocType; size_bytes: number; uploaded_at: string };
export type EventView = { id: number; case_id: string; event: string; created_at: string };
type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const BTN = "inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink hover:brightness-110 focus-visible:focus-ring disabled:opacity-50";
const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring";
const INPUT = "h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg focus:border-brand-green/50 focus:outline-none";

function RemoveDoc({ id, endpoint, demo }: { id: string; endpoint: string; demo: boolean }) {
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
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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

function DetailsForm({ c, save, demo }: { c: CaseView; save: Action; demo: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(save, null);
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

/**
 * One verification case: details, documents (camera-only for a creator's
 * identity images, ordinary upload for company documents), submission and
 * history. Used by an existing account (/verification) and by a pre-account
 * application (/apply); only the actions and the document endpoint differ.
 */
export function CaseEditor({
  c,
  docs,
  events,
  save,
  submit,
  docEndpoint,
  demo = false,
}: {
  c: CaseView;
  docs: DocView[];
  events: EventView[];
  save: Action;
  submit: Action;
  docEndpoint: string;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const editable = EDITABLE.includes(c.status);
  const present = docs.map((d) => d.doc_type);
  const missing = missingDocuments(c.kind, present);
  const camera = DOCUMENTS[c.kind].camera.filter(isCameraDocType);
  const upload = DOCUMENTS[c.kind].upload;
  const listed = docs.filter((d) => !isCameraDocType(d.doc_type));
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
      {c.status === "submitted" || c.status === "under_review" ? <p className="text-sm text-fg-secondary">{t("verification.reviewTime")}</p> : null}

      {editable ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">{t("verification.details")}</h3>
            <DetailsForm c={c} save={save} demo={demo} />
          </section>
          {camera.length ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">{t("camera.title")}</h3>
              <p className="text-xs leading-relaxed text-fg-muted">{t("camera.intro")}</p>
              <p className="text-xs leading-relaxed text-fg-muted">{t("camera.permission")}</p>
              {camera.map((d, i) => (
                <CameraCapture key={d} caseId={c.id} docType={d} endpoint={docEndpoint} captured={present.includes(d)} step={i + 1} total={camera.length} demo={demo} onUploaded={() => router.refresh()} />
              ))}
            </section>
          ) : null}
          {upload.length ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">{t("verification.documents")}</h3>
              <p className="text-xs leading-relaxed text-fg-muted">{t("verification.documentsHint")}</p>
              <DocumentUploader caseId={c.id} types={upload} endpoint={docEndpoint} demo={demo} />
            </section>
          ) : null}
          {missing.length ? (
            <p className="text-xs text-warning">
              {t("verification.required", { list: missing.map((set) => set.map((d) => t(`verification.docType.${d}`)).join(t("verification.or"))).join(", ") })}
            </p>
          ) : null}
        </>
      ) : null}

      {listed.length ? (
        <ul className="divide-y divide-line rounded-control border border-line text-sm">
          {listed.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-fg">{t(`verification.docType.${d.doc_type}`)} <span className="text-xs text-fg-muted">· {Math.ceil(d.size_bytes / 1024)} KB · {day(d.uploaded_at)}</span></span>
              {editable ? <RemoveDoc id={d.id} endpoint={docEndpoint} demo={demo} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        <ConfirmActionForm
          action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : submit}
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
