"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { InboundAliasCard } from "@/components/settings/InboundAliasCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { RedeemCodeForm } from "@/app/(app)/settings/RedeemCodeForm";
import { useTranslation } from "@/components/LocaleProvider";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";
import type { Profile } from "@/lib/auth";

/** Settings, presentation only. Shared with /preview. */
export function SettingsView({
  profile,
  demo = false,
}: {
  profile: Profile;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const plan = profile.subscription_plan ?? "Starter";
  // Split rather than interpolate so the plan name keeps its own styled span.
  const [onPlanBefore, onPlanAfter] = t("settings.onPlan").split("{plan}");

  return (
    <>
      <SectionHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <h2 className="text-sm font-semibold text-fg">{t("settings.account")}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-fg/45">{t("settings.name")}</dt>
              <dd className="text-fg">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">{t("settings.email")}</dt>
              {/*
                Safe here: this is the creator viewing their OWN profile. This
                value must never be rendered in a company's view of the product
                (§6, §12) — enforced by RLS, not by remembering not to.
              */}
              <dd className="text-fg">{profile.primary_email}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">{t("settings.role")}</dt>
              <dd className="text-fg capitalize">{profile.role}</dd>
            </div>
          </dl>
        </GlassPanel>

        {/* §4.3 — no in-app billing UI in the MVP. Surface the Discord CTA. */}
        <GlassPanel className="flex flex-col p-6">
          <h2 className="text-sm font-semibold text-fg">{t("settings.planBilling")}</h2>
          <p className="mt-1.5 text-sm text-fg/50">
            {onPlanBefore}
            <span className="text-brand-green">{plan}</span>
            {onPlanAfter}
            {profile.subscription_expires_at ? (
              <>
                {" "}
                {t("settings.endsOn", {
                  date: new Date(profile.subscription_expires_at).toLocaleDateString(),
                })}
              </>
            ) : null}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg/45">
            {t("settings.billingNote")}
          </p>

          <RedeemCodeForm demo={demo} />

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center text-xs text-brand-green underline underline-offset-2 hover:brightness-110"
          >
            {t("settings.openTicket")}
          </a>
        </GlassPanel>

        <div className="lg:col-span-2">
          <InboundAliasCard alias={profile.inbound_alias} />
        </div>
      </div>
    </>
  );
}
