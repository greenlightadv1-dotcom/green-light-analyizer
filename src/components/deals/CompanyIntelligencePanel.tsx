"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { analyzeCompany, type CompanyIntelState } from "@/app/(app)/inbox/[chatId]/actions";
import type { CompanyProfile } from "@/lib/ai/company-intel-types";
import type { DealChat } from "@/lib/deals/queries";
import type { OwnDomainHistory } from "@/lib/deals/company-intelligence";

/**
 * "Company & Domain Intelligence" — the negotiation workspace's answer to
 * "who is actually on the other side of this deal?"
 *
 * Two different, honest answers depending on the §3 deal source:
 *   - company_id set: a real registered Green Light company account. No
 *     WHOIS/trust score needed — the platform already vouches for the
 *     account existing, which a domain check cannot improve on.
 *   - company_id null: an external sender (forwarded email or pasted into
 *     the Manual Analyzer). Shows the cached security_check
 *     (lib/security/check.ts — WHOIS, Safe Browsing, trust score) plus the
 *     caller's own history with that domain (lib/deals/company-intelligence.ts).
 *
 * The panel now carries two scores, and keeping them apart is the point.
 * The top one is MEASURED — WHOIS records and a Safe Browsing verdict, run
 * through a fixed rubric. The bottom one is GENERATED — a language model's
 * read of the same domain plus the offer's own wording. They are labelled,
 * separated by a rule, and never averaged, because a product whose first
 * promise is "nothing is presented as verified unless it is" (§7.2) cannot
 * quietly blend an opinion into a measurement.
 */
function trustScoreClass(score: number): string {
  if (score >= 80) return "border-brand-green/30 bg-brand-green/10 text-brand-green";
  if (score >= 50) return "border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200";
  return "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200";
}

function AnalyzeButton({ hasProfile, demo }: { hasProfile: boolean; demo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      // Inert in the preview, same as StatusControl: a submit button in a
      // form with no action navigates the page away.
      type={demo ? "button" : "submit"}
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? t("inbox.analyzingCompany")
        : hasProfile
          ? t("inbox.reanalyzeCompany")
          : t("inbox.analyzeCompany")}
    </button>
  );
}

function CompanyBrief({ profile }: { profile: CompanyProfile }) {
  const { t } = useTranslation();

  const confidenceLabel = {
    low: t("inbox.confidenceLow"),
    medium: t("inbox.confidenceMedium"),
    high: t("inbox.confidenceHigh"),
  }[profile.confidence];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg/45">{t("inbox.aiTrustRead")}</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${trustScoreClass(profile.trustworthinessScore)}`}
        >
          {t("analyzer.trustPercent", { score: profile.trustworthinessScore })}
        </span>
      </div>

      {profile.isKnownToModel ? (
        <>
          {profile.background ? (
            <div>
              <h4 className="text-[11px] font-medium tracking-wide text-fg/45 uppercase">
                {t("inbox.aiBackground")}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-fg/65">{profile.background}</p>
            </div>
          ) : null}
          {profile.history ? (
            <div>
              <h4 className="text-[11px] font-medium tracking-wide text-fg/45 uppercase">
                {t("inbox.aiHistory")}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-fg/65">{profile.history}</p>
            </div>
          ) : null}
        </>
      ) : (
        // The model said it does not recognise the domain. Rendering the
        // absence plainly is the whole reason that flag exists — a hedged
        // paragraph here would read exactly like knowledge.
        <p className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-2 text-xs leading-relaxed text-fg/55">
          {t("inbox.aiCompanyUnknown")}
        </p>
      )}

      {profile.signals.length ? (
        <div>
          <h4 className="text-[11px] font-medium tracking-wide text-fg/45 uppercase">
            {t("inbox.aiSignals")}
          </h4>
          <ul className="mt-1.5 space-y-1">
            {profile.signals.map((signal) => (
              <li key={signal} className="flex gap-1.5 text-xs leading-relaxed text-fg/65">
                <span aria-hidden="true" className="text-fg/30">
                  •
                </span>
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-fg/30">
        {t("inbox.aiConfidence", { level: confidenceLabel })} ·{" "}
        {t("inbox.aiGeneratedAt", {
          date: new Date(profile.generatedAt).toLocaleDateString(),
        })}
      </p>
    </div>
  );
}

export function CompanyIntelligencePanel({
  chat,
  domainHistory,
  demo = false,
}: {
  chat: DealChat;
  /** Null when this is an in-app deal (company_id set) — not computed for those. */
  domainHistory: OwnDomainHistory | null;
  /** Preview mode: the analysis button is inert, since there is no session behind it. */
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [intelState, analyzeAction] = useActionState<CompanyIntelState, FormData>(
    analyzeCompany,
    { error: null, profile: null },
  );

  if (chat.company_id) {
    return (
      <GlassPanel className="p-5">
        <h2 className="text-sm font-semibold text-fg">{t("inbox.companyIntelligence")}</h2>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-green/30 bg-brand-green/10 px-2.5 py-1.5 text-xs font-medium text-brand-green">
          {t("inbox.verifiedCompanyAccount")}
        </p>
        <p className="mt-2.5 text-xs leading-relaxed text-fg/45">
          {t("inbox.verifiedCompanyAccountNote")}
        </p>
      </GlassPanel>
    );
  }

  const security = chat.security_check;
  // The freshly generated one wins over the cached column: after a re-run the
  // creator is looking at what they just asked for, not the previous answer.
  const profile = intelState.profile ?? chat.company_profile;

  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{t("inbox.companyIntelligence")}</h2>
        {security?.trustScore !== null && security?.trustScore !== undefined ? (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${trustScoreClass(security.trustScore)}`}
          >
            {t("analyzer.trustPercent", { score: security.trustScore })}
          </span>
        ) : (
          <span className="rounded-full border border-fg/15 px-2.5 py-1 text-xs text-fg/45">
            {t("analyzer.safetyScoreUnavailable")}
          </span>
        )}
      </div>

      <p className="mt-1 text-[11px] tracking-wide text-fg/35 uppercase">
        {t("inbox.measuredTag")}
      </p>

      <p className="mt-3 text-sm text-fg/60">
        {t("analyzer.domain")} <span className="text-fg">{security?.domain ?? domainHistory?.domain ?? "—"}</span>
      </p>

      {domainHistory?.isFreeEmail ? (
        <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-100">
          {t("inbox.freeEmailWarning")}
        </p>
      ) : null}

      {security?.reasons.length ? (
        <ul className="mt-3 space-y-1.5">
          {security.reasons.map((reason) => (
            <li
              key={reason}
              className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-100"
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {security?.whois ? (
        <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fg/45">{t("analyzer.companyOrg")}</dt>
            <dd className="text-sm text-fg">{security.whois.registrantOrganization ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg/45">{t("analyzer.registrantCountry")}</dt>
            <dd className="text-sm text-fg">{security.whois.registrantCountry ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg/45">{t("analyzer.domainCreated")}</dt>
            <dd className="text-sm text-fg">
              {security.whois.createdAt ? new Date(security.whois.createdAt).toLocaleDateString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg/45">{t("analyzer.domainExpires")}</dt>
            <dd className="text-sm text-fg">
              {security.whois.expiresAt ? new Date(security.whois.expiresAt).toLocaleDateString() : "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-xs text-fg/40">{t("analyzer.whoisUnavailable")}</p>
      )}

      <div className="mt-4 border-t border-fg/8 pt-3">
        <h3 className="text-xs font-medium tracking-wide text-fg/60 uppercase">
          {t("inbox.yourHistory")}
        </h3>
        {domainHistory && domainHistory.dealCount > 0 ? (
          <p className="mt-1.5 text-xs leading-relaxed text-fg/55">
            {t("inbox.yourHistoryNote", {
              count: domainHistory.dealCount,
              agreed: domainHistory.agreedOrPaidCount,
            })}
            {domainHistory.disputedCount > 0
              ? ` ${t("inbox.yourHistoryDisputed", { count: domainHistory.disputedCount })}`
              : ""}
          </p>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-fg/40">{t("inbox.yourHistoryNone")}</p>
        )}
      </div>

      {/* ── generated, below the rule, never mixed into the measured half ── */}
      <div className="mt-4 border-t border-fg/8 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium tracking-wide text-fg/60 uppercase">
            {t("inbox.aiCompanyBrief")}
          </h3>
          <span className="rounded-full border border-fg/12 px-2 py-0.5 text-[10px] tracking-wide text-fg/40 uppercase">
            {t("inbox.aiGeneratedTag")}
          </span>
        </div>

        {profile ? (
          <CompanyBrief profile={profile} />
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-fg/45">
            {t("inbox.aiCompanyIntro")}
          </p>
        )}

        {intelState.error ? (
          <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
            {intelState.error}
          </p>
        ) : null}

        <form action={demo ? undefined : analyzeAction} className="mt-3">
          <input type="hidden" name="chat_id" value={chat.id} />
          <AnalyzeButton hasProfile={profile !== null} demo={demo} />
        </form>
      </div>
    </GlassPanel>
  );
}
