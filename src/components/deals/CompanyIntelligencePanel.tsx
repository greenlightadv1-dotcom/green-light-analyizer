"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
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
 */
function trustScoreClass(score: number): string {
  if (score >= 80) return "border-brand-green/30 bg-brand-green/10 text-brand-green";
  if (score >= 50) return "border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200";
  return "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200";
}

export function CompanyIntelligencePanel({
  chat,
  domainHistory,
}: {
  chat: DealChat;
  /** Null when this is an in-app deal (company_id set) — not computed for those. */
  domainHistory: OwnDomainHistory | null;
}) {
  const { t } = useTranslation();

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
    </GlassPanel>
  );
}
