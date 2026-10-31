"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { IntegrationStatusBadge } from "@/components/media-kit/IntegrationStatusBadge";
import { useTranslation } from "@/components/LocaleProvider";
import { DISCORD_INVITE_URL, WHATSAPP_URL } from "@/lib/constants/contact";
import { CHANGE_NOTICE_DAYS, SUPPORT_EMAIL } from "@/lib/constants/legal";
import {
  INTEGRATION_LABELS,
  INTEGRATION_PLATFORMS,
  INTEGRATION_STATUS,
  type IntegrationStatus,
} from "@/lib/media-kit/platforms";
import { CREATOR_PLAN } from "@/lib/plans";
import { useSupportOpenNow } from "@/components/support/useSupportOpenNow";
import type { Profile } from "@/lib/auth";

const STATUS_NOTE_KEY: Record<IntegrationStatus, string> = {
  available: "integrations.availableNote",
  in_development: "integrations.inDevelopmentNote",
  manual: "integrations.manualNote",
  planned: "integrations.plannedNote",
};

const LINK_CLASS =
  "inline-flex items-center text-sm text-brand-green underline underline-offset-4 transition hover:brightness-110";

/**
 * Pricing — the unified Creator Plan and free Company Access (lib/plans.ts),
 * the platform integrations exactly as they stand today
 * (media-kit/platforms.ts INTEGRATION_STATUS), and the support channels with
 * their published hours (lib/support.ts). No in-app billing (§4).
 */
export function PricingView({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const openNow = useSupportOpenNow();
  const isCreatorSide = profile.role !== "company";

  return (
    <>
      <SectionHeader title={t("pricing.title")} description={t("pricing.description")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel
          className={`flex flex-col p-6 lg:col-span-2 ${isCreatorSide ? "border-brand-green/40 ring-1 ring-brand-green/20" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-fg">{t(CREATOR_PLAN.nameKey)}</h2>
            {profile.role === "creator" ? (
              <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-medium text-brand-green">
                {t("pricing.yourPlan")}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-fg/55">{t("pricing.creatorSummary")}</p>

          <p className="mt-4 text-2xl font-semibold text-fg">
            {CREATOR_PLAN.commission}{" "}
            <span className="text-sm font-normal text-fg/45">{t("pricing.commissionPerDeal")}</span>
          </p>
          <p className="mt-2 text-xs font-medium leading-relaxed text-fg/65">
            {/*
              Historical, literal on purpose (W1): the one-time 10% change of
              31 October 2026 is written into each dictionary, not built from
              CREATOR_COMMISSION or COMMISSION_EFFECTIVE_DATE, so a later rate
              or date change cannot rewrite it. Only the notice period for
              future changes is current policy, so only it is a parameter.
            */}
            {t("pricing.commissionEffective", { days: CHANGE_NOTICE_DAYS })}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg/45">{t("pricing.settlementNote")}</p>

          <ul className="mt-5 grid gap-2 text-sm leading-relaxed text-fg/65 sm:grid-cols-2">
            {CREATOR_PLAN.featureKeys.map((key) => (
              <li key={key} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-green" aria-hidden />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs leading-relaxed text-fg/40">{t("pricing.fairUseNote")}</p>
        </GlassPanel>

        <GlassPanel
          className={`flex flex-col p-6 ${!isCreatorSide ? "border-brand-green/40 ring-1 ring-brand-green/20" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-fg">{t("pricing.companyName")}</h2>
            {profile.role === "company" ? (
              <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-medium text-brand-green">
                {t("pricing.yourPlan")}
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-2xl font-semibold text-fg">{t("pricing.companyFree")}</p>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-fg/60">{t("pricing.companiesNote")}</p>
        </GlassPanel>
      </div>

      <GlassPanel as="section" className="mt-4 p-6">
        <h2 className="text-sm font-semibold text-fg">{t("integrations.title")}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-fg/50">{t("integrations.description")}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_PLATFORMS.map((platform) => {
            const status = INTEGRATION_STATUS[platform];
            return (
              <li key={platform} className="rounded-xl border border-fg/10 bg-fg/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">{INTEGRATION_LABELS[platform]}</span>
                  <IntegrationStatusBadge status={status} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg/50">{t(STATUS_NOTE_KEY[status])}</p>
              </li>
            );
          })}
        </ul>
      </GlassPanel>

      <GlassPanel as="section" className="mt-4 p-6">
        <h2 className="text-sm font-semibold text-fg">{t("support.title")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{t("support.hours")}</p>
        <p className="mt-1 text-xs leading-relaxed text-fg/45">{t("support.hoursNote")}</p>
        {openNow === null ? null : (
          <p className={`mt-2 text-xs font-medium ${openNow ? "text-brand-green" : "text-fg/50"}`}>
            {openNow ? t("support.openNow") : t("support.closedNow")}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-6">
          <li>
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK_CLASS}>
              {t("support.email")}: {SUPPORT_EMAIL}
            </a>
          </li>
          <li>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {t("support.discord")}
            </a>
          </li>
          <li>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {t("support.whatsapp")}
            </a>
          </li>
        </ul>
      </GlassPanel>
    </>
  );
}
