"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { RedeemCodeForm } from "@/app/(app)/pricing/RedeemCodeForm";
import { useTranslation } from "@/components/LocaleProvider";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";
import { PLANS } from "@/lib/plans";
import type { Profile } from "@/lib/auth";

/**
 * Pricing & Plans — CLAUDE.md §8's table as plan cards, and the promo-code
 * redemption that used to live in Settings (§4.3: no in-app billing in the
 * MVP, every action here routes to Discord).
 */
export function PricingView({ profile, demo = false }: { profile: Profile; demo?: boolean }) {
  const { t } = useTranslation();
  const currentPlan = profile.subscription_plan ?? "Starter";
  const [onPlanBefore, onPlanAfter] = t("pricing.onPlan").split("{plan}");

  return (
    <>
      <SectionHeader title={t("pricing.title")} description={t("pricing.description")} />

      <p className="mb-5 text-sm text-fg/60">
        {onPlanBefore}
        <span className="text-brand-green">{currentPlan}</span>
        {onPlanAfter}
        {profile.subscription_expires_at ? (
          <>
            {" "}
            {t("pricing.endsOn", {
              date: new Date(profile.subscription_expires_at).toLocaleDateString(),
            })}
          </>
        ) : null}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === currentPlan;
          return (
            <GlassPanel
              key={plan.tier}
              className={`flex flex-col p-6 ${plan.highlighted ? "border-brand-green/40 ring-1 ring-brand-green/20" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg">{t(plan.nameKey)}</h2>
                {isCurrent ? (
                  <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-medium text-brand-green">
                    {t("pricing.current")}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-2xl font-semibold text-fg">
                  {plan.menaPrice}
                  <span className="text-sm font-normal text-fg/40">{t("pricing.perMonth")}</span>
                </p>
                <p className="text-xs text-fg/45">
                  {t("pricing.mena")} · {plan.intlPrice} {t("pricing.international")}
                </p>
              </div>

              <p className="mt-2 text-xs font-medium text-fg/50">
                {t("pricing.commission", { pct: plan.commission })}
              </p>

              <p className="mt-4 flex-1 text-sm leading-relaxed text-fg/60">{t(plan.featuresKey)}</p>

              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition ${
                  plan.highlighted
                    ? "bg-brand-green text-ink hover:brightness-110"
                    : "border border-fg/10 bg-fg/5 text-fg hover:bg-fg/10"
                }`}
              >
                {t("pricing.manageOnDiscord")}
              </a>
            </GlassPanel>
          );
        })}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-fg/40">{t("pricing.companiesNote")}</p>

      <GlassPanel className="mt-6 max-w-xl p-6">
        <h2 className="text-sm font-semibold text-fg">{t("pricing.redeemTitle")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg/50">{t("pricing.billingNote")}</p>

        <RedeemCodeForm demo={demo} />

        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center text-xs text-brand-green underline underline-offset-2 hover:brightness-110"
        >
          {t("pricing.openTicket")}
        </a>
      </GlassPanel>
    </>
  );
}
