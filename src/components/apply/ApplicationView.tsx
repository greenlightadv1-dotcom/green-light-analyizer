"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { CaseEditor, type CaseView, type DocView, type EventView } from "@/components/verification/CaseEditor";
import type { ActionResult } from "@/lib/ui/action-result";
import type { LinkState } from "@/app/apply/actions";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring";

/**
 * A pre-account application (no Green Light account exists yet): who is
 * applying, the case editor, and where they stand. After approval the next
 * step is the emailed one-time activation link; nothing here creates an
 * account.
 */
export function ApplicationView({
  applicant,
  cases,
  documents,
  events,
  save,
  submit,
  leave,
  demo = false,
}: {
  applicant: { full_name: string; email: string; journey: "creator" | "company" | "company_representative"; company_name: string | null };
  cases: CaseView[];
  documents: DocView[];
  events: EventView[];
  save: Action;
  submit: Action;
  leave?: () => Promise<void>;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const approved = cases.length > 0 && cases.every((c) => c.status === "approved");
  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 pt-12 pb-20 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{t("apply.title")}</h1>
      <ol aria-label={t("apply.stepsLabel")} className="grid gap-2 text-xs sm:grid-cols-4">
        {(["apply", "review", "email", "account"] as const).map((s, i) => (
          <li key={s} className="rounded-control border border-line bg-surface-muted px-3 py-2 text-fg-secondary">
            <span className="font-semibold text-fg">{i + 1}. </span>{t(`apply.steps.${s}`)}
          </li>
        ))}
      </ol>
      <GlassPanel className="space-y-1 p-5 text-sm">
        <p className="text-fg"><span className="text-fg-muted">{t("apply.applicant")}: </span><span dir="auto">{applicant.full_name}</span></p>
        <p className="text-fg"><span className="text-fg-muted">{t("apply.email")}: </span><span dir="ltr">{applicant.email}</span></p>
        <p className="text-fg"><span className="text-fg-muted">{t("apply.journey")}: </span>{t(`getStarted.journey.${applicant.journey}.title`)}{applicant.company_name ? <> · <span dir="auto">{applicant.company_name}</span></> : null}</p>
        <p className="pt-2 text-xs text-fg-muted">{t("apply.noAccountYet")}</p>
      </GlassPanel>
      {approved ? <GlassPanel className="border-success/40 p-5 text-sm text-fg">{t("apply.approved")}</GlassPanel> : null}
      {cases.map((c) => (
        <CaseEditor
          key={c.id}
          c={c}
          demo={demo}
          docs={documents.filter((d) => d.case_id === c.id)}
          events={events.filter((e) => e.case_id === c.id)}
          save={save}
          submit={submit}
          docEndpoint="/api/applications/documents"
        />
      ))}
      <p className="text-xs leading-relaxed text-fg-muted">{t("verification.noFaceCheck")}</p>
      <div className="flex flex-wrap items-center gap-3">
        {leave && !demo ? (
          <form action={leave}>
            <button type="submit" className={GHOST}>{t("apply.leave")}</button>
          </form>
        ) : null}
        <p className="text-xs text-fg-muted">{t("apply.leaveHint")}</p>
      </div>
    </section>
  );
}

/** No valid application on this device: explain, and offer a new emailed link. */
export function ApplicationLinkRequest({
  reason,
  action,
}: {
  reason: "none" | "expired" | "invalid" | "rate_limited";
  action: (prev: LinkState, fd: FormData) => Promise<LinkState>;
}) {
  const { t } = useTranslation();
  const [state, formAction, pending] = useActionState<LinkState, FormData>(action, { status: "idle" });
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 pt-16 pb-20 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("apply.title")}</h1>
      <GlassPanel className="space-y-4 p-6">
        <p className="text-sm text-fg">{t(`apply.link.${reason}`)}</p>
        {state.status === "sent" ? (
          <p role="status" className="text-sm text-success">{t("apply.linkSent")}</p>
        ) : (
          <form action={formAction} className="space-y-3">
            <label className="block text-xs font-medium text-fg-secondary">
              {t("apply.email")}
              <input name="email" type="email" required maxLength={254} dir="ltr" autoComplete="email" className="mt-1 h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg" />
            </label>
            <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink disabled:opacity-50">
              {pending ? t("apply.sending") : t("apply.sendLink")}
            </button>
            {state.status === "invalid" ? <p role="alert" className="text-xs text-danger">{t("apply.errors.email")}</p> : null}
            {state.status === "rate_limited" ? <p role="alert" className="text-xs text-danger">{t("getStarted.error.rate_limited")}</p> : null}
          </form>
        )}
        <p className="text-xs text-fg-muted">{t("apply.newApplication")} <Link href="/get-started" className="underline">{t("apply.getStarted")}</Link></p>
      </GlassPanel>
    </section>
  );
}
