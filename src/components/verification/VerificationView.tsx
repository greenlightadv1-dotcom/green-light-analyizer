"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { saveVerificationDetails, startVerification, submitVerification } from "@/app/verification/actions";
import type { ActionResult } from "@/lib/ui/action-result";
import type { AccountStatus, VerificationKind } from "@/lib/types/database";
import { CaseEditor, type CaseView, type DocView, type EventView } from "./CaseEditor";

const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring";

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
          <CaseEditor
            key={c.id}
            c={c}
            demo={demo}
            docs={documents.filter((d) => d.case_id === c.id)}
            events={events.filter((e) => e.case_id === c.id)}
            save={saveVerificationDetails}
            submit={submitVerification}
            docEndpoint="/api/verification/documents"
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-fg-muted">{t("verification.noFaceCheck")}</p>
    </>
  );
}
