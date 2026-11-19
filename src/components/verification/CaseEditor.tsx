"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DOCUMENTS, EDITABLE, FIELDS, STEPS, missingDocuments, type FieldDef, type StepDef } from "@/lib/verification/rules";
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
const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring disabled:opacity-50";
const INPUT = "w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg focus:border-brand-green/50 focus:outline-none";

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

/** One input, rendered by its type. Labels and hints come from the dictionary. */
function FieldInput({ f, value }: { f: FieldDef; value: string }) {
  const { t } = useTranslation();
  const id = `vf-${f.key}`;
  const hintKey = `verification.hint.${f.key}`;
  const hint = t(hintKey);
  const label = (
    <span className="block text-xs font-medium text-fg-secondary">
      {t(`verification.field.${f.key}`)}{f.required ? <span aria-hidden="true"> *</span> : null}
    </span>
  );
  const describedBy = hint !== hintKey ? `${id}-hint` : undefined;
  const hintEl = describedBy ? <span id={describedBy} className="mt-1 block text-xs text-fg-muted">{hint}</span> : null;

  if (f.type === "multiselect") {
    const chosen = new Set(value.split(",").filter(Boolean));
    return (
      <fieldset className="sm:col-span-2" aria-describedby={describedBy}>
        <legend>{label}</legend>
        {/* Always present, so clearing every box is saved as "none". */}
        <input type="hidden" name={f.key} value="" />
        <div className="mt-1 flex flex-wrap gap-2">
          {f.options?.map((o) => (
            <label key={o} className="inline-flex items-center gap-2 rounded-chip border border-line bg-surface-muted px-3 py-1.5 text-sm text-fg has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/10">
              <input type="checkbox" name={f.key} value={o} defaultChecked={chosen.has(o)} className="accent-[var(--color-brand-green)]" />
              {t(`taxonomy.category.${o}`)}
            </label>
          ))}
        </div>
        {hintEl}
      </fieldset>
    );
  }
  if (f.type === "select") {
    return (
      <label className="block">
        {label}
        <select id={id} name={f.key} defaultValue={value} required={f.required} aria-describedby={describedBy} className={`${INPUT} mt-1 h-10`}>
          <option value="" className="bg-surface text-fg">{t("verification.wizard.select")}</option>
          {f.options?.map((o) => <option key={o} value={o} className="bg-surface text-fg">{t(`verification.option.platform.${o}`)}</option>)}
        </select>
        {hintEl}
      </label>
    );
  }
  if (f.type === "textarea" || f.type === "urls") {
    return (
      <label className="block sm:col-span-2">
        {label}
        <textarea id={id} name={f.key} defaultValue={value} maxLength={f.max} rows={3} required={f.required} dir={f.type === "urls" ? "ltr" : "auto"} aria-describedby={describedBy} className={`${INPUT} mt-1 py-2`} />
        {hintEl}
      </label>
    );
  }
  return (
    <label className="block">
      {label}
      <input
        id={id}
        name={f.key}
        type={f.type === "date" ? "date" : f.type === "phone" ? "tel" : f.type === "url" ? "url" : "text"}
        defaultValue={value}
        maxLength={f.max}
        required={f.required}
        inputMode={f.type === "phone" ? "tel" : undefined}
        dir={f.type === "phone" || f.type === "url" || f.type === "country" || f.type === "handle" || f.type === "idnumber" ? "ltr" : "auto"}
        autoComplete={f.type === "phone" ? "tel" : f.key === "legal_name" ? "name" : "off"}
        aria-describedby={describedBy}
        className={`${INPUT} mt-1 h-10`}
      />
      {hintEl}
    </label>
  );
}

/** A step of fields: one short form, saved on "Save and continue". */
function FieldsStep({ c, step, values, save, demo, onDone, onBack }: { c: CaseView; step: StepDef; values: Record<string, string>; save: Action; demo: boolean; onDone: () => void; onBack: (() => void) | null }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(save, null);
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onDone();
    }
  }, [state, onDone]);
  const fields = FIELDS[c.kind].filter((f) => step.fields.includes(f.key));
  const reused = fields.some((f) => f.fromProfile && !c.details?.[f.key] && values[f.key]);
  return (
    <form action={demo ? undefined : action} className="space-y-4">
      <input type="hidden" name="case_id" value={c.id} />
      {reused ? <p className="text-xs text-info">{t("verification.reused")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => <FieldInput key={f.key} f={f} value={values[f.key] ?? ""} />)}
      </div>
      {state && !state.ok ? <p role="alert" className="text-sm text-danger">{t(state.errorKey)}</p> : null}
      <StepNav onBack={onBack}>
        <button type={demo ? "button" : "submit"} onClick={demo ? onDone : undefined} disabled={pending} className={BTN}>{pending ? t("verification.saving") : t("verification.wizard.saveContinue")}</button>
      </StepNav>
    </form>
  );
}

function StepNav({ onBack, children }: { onBack: (() => void) | null; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      {onBack ? <button type="button" onClick={onBack} className={GHOST}>{t("verification.wizard.back")}</button> : <span />}
      {children}
    </div>
  );
}

/**
 * One verification case as a multi-step journey (docs/REGISTRATION_ONBOARDING_FLOW.md):
 * a progress indicator, one short step at a time, a final review, and then a
 * status view. Used by an existing account (/verification) and by a
 * pre-account application (/apply); only the actions, the document endpoint
 * and `application` differ. The server re-validates every step and the
 * database decides what can be submitted.
 */
export function CaseEditor({
  c,
  docs,
  events,
  save,
  submit,
  docEndpoint,
  application = false,
  emailVerified = true,
  demo = false,
}: {
  c: CaseView;
  docs: DocView[];
  events: EventView[];
  save: Action;
  submit: Action;
  docEndpoint: string;
  /** A pre-account application (the public photo is required, and the email must be verified). */
  application?: boolean;
  emailVerified?: boolean;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const editable = EDITABLE.includes(c.status);
  const steps = STEPS[c.kind];
  const values = c.prefill.values;
  const present = docs.map((d) => d.doc_type);
  const missingDocs = missingDocuments(c.kind, present, { application });
  const missingFieldKeys = FIELDS[c.kind].filter((f) => f.required && !c.details?.[f.key]?.trim()).map((f) => f.key);
  const stepIncomplete = (s: StepDef) =>
    s.fields.some((k) => missingFieldKeys.includes(k)) || missingDocs.some((set) => set.some((d) => s.docs.includes(d)));
  // Resume where the person left off: the first incomplete step, else the review.
  const firstOpen = steps.findIndex((s) => s.id !== "review" && stepIncomplete(s));
  const [index, setIndex] = useState(firstOpen === -1 ? steps.length - 1 : firstOpen);
  const heading = useRef<HTMLHeadingElement>(null);
  const go = (i: number) => {
    setIndex(Math.min(Math.max(i, 0), steps.length - 1));
    requestAnimationFrame(() => heading.current?.focus());
  };
  const step = steps[index];
  const ready = !missingFieldKeys.length && !missingDocs.length && emailVerified;

  return (
    <GlassPanel className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{t(`verification.kind.${c.kind}`)}</h2>
        <StatusBadge tone={VERIFICATION_TONE[c.status]}>{t(`verification.status.${c.status}`)}</StatusBadge>
      </div>

      {editable ? (
        <>
          {c.status === "needs_info" ? (
            <div className="space-y-2 rounded-control border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-semibold text-fg">{t("verification.wizard.needsInfoTitle")}</p>
              {c.info_request ? <p dir="auto" className="whitespace-pre-wrap text-fg">{c.info_request}</p> : null}
              {missingFieldKeys.length || missingDocs.length ? (
                <p className="text-xs text-fg-secondary">
                  {t("verification.wizard.stillMissing")}{" "}
                  {[...missingFieldKeys.map((k) => t(`verification.field.${k}`)), ...missingDocs.map((set) => set.map((d) => t(`verification.docType.${d}`)).join(t("verification.or")))].join(", ")}
                </p>
              ) : null}
              <p className="text-xs text-fg-muted">{t("verification.wizard.needsInfoHint")}</p>
            </div>
          ) : null}

          <nav aria-label={t("verification.wizard.progress")}>
            <p className="mb-2 text-xs text-fg-muted">{t("verification.wizard.stepOf", { n: index + 1, total: steps.length })}</p>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
            </div>
            <ol className="flex flex-wrap gap-2">
              {steps.map((s, i) => {
                const done = s.id !== "review" && !stepIncomplete(s);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={i === index ? "step" : undefined}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-chip border px-3 text-xs focus-visible:focus-ring ${i === index ? "border-brand-green bg-brand-green/15 font-semibold text-fg" : "border-line bg-surface-muted text-fg-secondary hover:bg-surface-hover"}`}
                    >
                      <span aria-hidden="true">{done ? "✓" : i + 1}</span>
                      {t(`verification.wizard.step.${s.id}`)}
                      {done ? <span className="sr-only">({t("verification.wizard.complete")})</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section aria-labelledby={`step-${c.id}`} className="space-y-4">
            <div>
              <h3 id={`step-${c.id}`} ref={heading} tabIndex={-1} className="text-lg font-semibold text-fg focus:outline-none">{t(`verification.wizard.step.${step.id}`)}</h3>
              <p className="mt-1 text-sm text-fg-secondary">{t(`verification.wizard.intro.${c.kind}.${step.id}`)}</p>
            </div>

            {step.docs.length ? (
              <>
                {(() => {
                  const camera = step.docs.filter((d) => DOCUMENTS[c.kind].camera.includes(d)).filter(isCameraDocType);
                  const upload = step.docs.filter((d) => DOCUMENTS[c.kind].upload.includes(d));
                  const listed = docs.filter((d) => upload.includes(d.doc_type));
                  const stepMissing = missingDocs.filter((set) => set.some((d) => step.docs.includes(d)));
                  return (
                    <div className="space-y-4">
                      {camera.length ? (
                        <div className="space-y-3">
                          <p className="text-xs leading-relaxed text-fg-muted">{t("camera.intro")}</p>
                          <p className="text-xs leading-relaxed text-fg-muted">{t("camera.permission")}</p>
                          {camera.map((d, i) => (
                            <CameraCapture key={d} caseId={c.id} docType={d} endpoint={docEndpoint} captured={present.includes(d)} step={i + 1} total={camera.length} demo={demo} onUploaded={() => router.refresh()} />
                          ))}
                        </div>
                      ) : null}
                      {upload.length ? (
                        <div className="space-y-3">
                          <p className="text-xs leading-relaxed text-fg-muted">{t(upload.includes("profile_photo") ? "verification.wizard.photoHint" : "verification.documentsHint")}</p>
                          <DocumentUploader key={upload.join()} caseId={c.id} types={upload} endpoint={docEndpoint} demo={demo} />
                          {listed.length ? (
                            <ul className="divide-y divide-line rounded-control border border-line text-sm">
                              {listed.map((d) => (
                                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                  <span className="text-fg">✓ {t(`verification.docType.${d.doc_type}`)} <span className="text-xs text-fg-muted">· {Math.ceil(d.size_bytes / 1024)} KB · {day(d.uploaded_at)}</span></span>
                                  <RemoveDoc id={d.id} endpoint={docEndpoint} demo={demo} />
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      {stepMissing.length ? (
                        <p className="text-xs text-warning">{t("verification.required", { list: stepMissing.map((set) => set.map((d) => t(`verification.docType.${d}`)).join(t("verification.or"))).join(", ") })}</p>
                      ) : (
                        <p className="text-xs text-success">{t("verification.wizard.stepDone")}</p>
                      )}
                      {/* A step that also has fields is navigated by its form below (one Back, one Continue). */}
                      {step.fields.length ? null : <StepNav onBack={index ? () => go(index - 1) : null}>
                        <button type="button" onClick={() => go(index + 1)} className={stepMissing.length ? GHOST : BTN}>
                          {stepMissing.length ? t("verification.wizard.continueLater") : t("verification.wizard.continue")}
                        </button>
                      </StepNav>}
                    </div>
                  );
                })()}
              </>
            ) : null}

            {step.fields.length ? (
              <FieldsStep key={step.id} c={c} step={step} values={values} save={save} demo={demo} onDone={() => go(index + 1)} onBack={index ? () => go(index - 1) : null} />
            ) : null}

            {step.id === "review" ? (
              <div className="space-y-4">
                {steps.filter((s) => s.id !== "review").map((s) => (
                  <div key={s.id} className="rounded-control border border-line p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-fg">{t(`verification.wizard.step.${s.id}`)}</h4>
                      <button type="button" onClick={() => go(steps.indexOf(s))} className="text-xs text-accent underline focus-visible:focus-ring">{t("verification.wizard.edit")}</button>
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      {FIELDS[c.kind].filter((f) => s.fields.includes(f.key)).map((f) => {
                        const v = c.details?.[f.key] ?? "";
                        const shown = f.type === "multiselect" ? v.split(",").filter(Boolean).map((o) => t(`taxonomy.category.${o}`)).join(", ") : f.type === "select" && v ? t(`verification.option.platform.${v}`) : v;
                        return (
                          <div key={f.key}>
                            <dt className="text-xs text-fg-muted">{t(`verification.field.${f.key}`)}</dt>
                            <dd dir="auto" className={`[overflow-wrap:anywhere] whitespace-pre-wrap ${v ? "text-fg" : f.required ? "text-warning" : "text-fg-muted"}`}>{v ? shown : f.required ? t("verification.wizard.missing") : "—"}</dd>
                          </div>
                        );
                      })}
                      {s.docs.map((d) => (
                        <div key={d}>
                          <dt className="text-xs text-fg-muted">{t(`verification.docType.${d}`)}</dt>
                          <dd className={present.includes(d) ? "text-success" : missingDocs.some((set) => set.includes(d)) ? "text-warning" : "text-fg-muted"}>
                            {present.includes(d) ? t("verification.wizard.provided") : missingDocs.some((set) => set.includes(d)) ? t("verification.wizard.missing") : t("verification.wizard.optional")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                {application ? (
                  <p className={`text-sm ${emailVerified ? "text-success" : "text-warning"}`}>{t(emailVerified ? "verification.wizard.emailVerified" : "verification.wizard.emailUnverified")}</p>
                ) : null}
                <p className="text-xs text-fg-muted">{t("verification.wizard.phoneNote")}</p>
                {ready ? (
                  <ConfirmActionForm
                    action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : submit}
                    hidden={{ case_id: c.id }}
                    trigger={{ labelKey: c.status === "needs_info" ? "verification.wizard.resubmit" : "verification.submit" }}
                    triggerClassName={BTN}
                    titleKey="verification.submitTitle"
                    bodyKey="verification.submitBody"
                    confirmKey="verification.submitConfirm"
                    successKey="verification.submitted"
                    once
                    className="space-y-3"
                  >
                    <label className="flex items-start gap-2 text-sm text-fg">
                      <input type="checkbox" name="consent" required className="mt-1" />
                      <span>{t("verification.consent")}</span>
                    </label>
                  </ConfirmActionForm>
                ) : (
                  <p role="status" className="rounded-control border border-warning/40 bg-warning/10 p-3 text-sm text-fg">{t("verification.wizard.notReady")}</p>
                )}
                <StepNav onBack={() => go(index - 1)}>{null}</StepNav>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <StatusPanel c={c} application={application} />
      )}

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

/** Where a case stands once it is out of the applicant's hands. */
function StatusPanel({ c, application }: { c: CaseView; application: boolean }) {
  const { t } = useTranslation();
  const tone = c.status === "approved" ? "border-success/40 bg-success/10" : c.status === "rejected" ? "border-danger/40 bg-danger/10" : "border-info/30 bg-info/10";
  return (
    <div role="status" className={`space-y-2 rounded-control border p-4 text-sm ${tone}`}>
      <p className="font-semibold text-fg">{t(`verification.wizard.statusTitle.${c.status}`)}</p>
      <p className="text-fg-secondary">{t(`verification.wizard.statusBody.${c.status}${c.status === "approved" ? (application ? "_application" : "_account") : ""}`)}</p>
      {c.status === "submitted" || c.status === "under_review" ? <p className="text-xs text-fg-muted">{t("verification.reviewTime")}</p> : null}
      {c.status === "rejected" && c.decision_reason ? (
        <div>
          <p className="text-xs text-fg-muted">{t("verification.wizard.reason")}</p>
          <p dir="auto" className="whitespace-pre-wrap text-fg">{c.decision_reason}</p>
        </div>
      ) : null}
      {c.status === "rejected" ? <p className="text-xs text-fg-muted">{t("verification.wizard.rejectedHelp")}</p> : null}
      {c.status === "rejected" && application ? (
        <p className="text-sm"><Link href="/get-started" className="text-accent underline">{t("verification.wizard.startNew")}</Link></p>
      ) : null}
    </div>
  );
}
