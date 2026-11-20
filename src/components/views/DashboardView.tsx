"use client";

import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { DealList } from "@/components/dashboard/DealList";
import { CREATOR_ACTIONS, QuickActions } from "@/components/dashboard/QuickActions";
import { CopyButton } from "@/components/ui/CopyButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { CREATOR_COMMISSION } from "@/lib/plans";
import { useTranslation } from "@/components/LocaleProvider";
import { isProfileIncomplete } from "@/lib/media-kit/profile-completeness";
import type { DealChatListItem } from "@/lib/deals/queries";
import type { MediaKit } from "@/lib/media-kit/queries";
import type { Profile } from "@/lib/auth";
import { isVerifiedGeoFresh } from "@/lib/oauth/youtube-freshness";

/**
 * Creator dashboard, presentation only.
 *
 * Split from the page so the same markup renders both from live data and from
 * the mock dataset at /preview. A preview that reimplemented the UI would drift
 * from it within a week and stop being worth looking at.
 */
export function DashboardView({
  profile,
  chats,
  kits,
  basePath = "",
}: {
  profile: Profile;
  chats: DealChatListItem[];
  kits: MediaKit[];
  /** Link prefix; the UI preview passes "/preview" to stay inside itself. */
  basePath?: string;
}) {
  const { t } = useTranslation();
  const recent = chats.slice(0, 5);
  const openDeals = chats.filter(
    (c) => c.deal_status !== "paid" && c.deal_status !== "disputed",
  ).length;
  const verifiedKits = kits.filter((k) => isVerifiedGeoFresh(k)).length;
  const incompleteProfile = isProfileIncomplete(profile, kits);

  return (
    <>
      <SectionHeader
        title={t("dashboard.welcomeBack", { name: profile.full_name.split(" ")[0] })}
        description={t("dashboard.subtitle")}
      />

      {incompleteProfile ? (
        <Link
          href={`${basePath}/onboarding`}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-green/25 bg-brand-green/8 px-5 py-4 transition hover:bg-brand-green/12"
        >
          <div>
            <p className="text-sm font-semibold text-fg">{t("dashboard.completeProfileTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t("dashboard.completeProfileBody")}</p>
          </div>
          <span className="shrink-0 text-xs font-medium text-accent">
            {t("dashboard.completeProfileCta")}
          </span>
        </Link>
      ) : null}

      <QuickActions actions={CREATOR_ACTIONS} basePath={basePath} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-lime flex flex-col p-5 sm:p-6">
          <p className="text-sm font-semibold text-ink/75">
            {t("dashboard.openDeals")}
          </p>
          <p className="mt-2 text-4xl font-bold text-ink tabular-nums sm:text-5xl">
            {openDeals}
          </p>
          <p className="mt-auto pt-4 text-xs font-medium text-ink/70">
            {t("dashboard.pricingNote", { pct: CREATOR_COMMISSION })}
          </p>
        </div>

        <GlassPanel className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg-muted">
              {t("dashboard.inboundAlias")}
            </p>
            {profile.inbound_alias ? <CopyButton value={profile.inbound_alias} /> : null}
          </div>
          <p className="mt-2 rounded-xl border border-fg/10 bg-forest-strong px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
            {profile.inbound_alias ?? t("dashboard.notIssuedYet")}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {t("dashboard.forwardEmailNote")}
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {recent.length === 0 ? (
            <EmptyState
              title={t("dashboard.noDealsYetTitle")}
              body={t("dashboard.noDealsYetBody")}
            />
          ) : (
            <DealList chats={recent} total={chats.length} title={(c) => ({ text: c.sender_email, ltr: true })} basePath={basePath} />
          )}
        </div>

        {/*
          §7.2/§7.4 made concrete: the reason to connect analytics is that
          unverified geography caps a high-value deal at yellow. Saying that
          beats a generic "connect your accounts" prompt.
        */}
        <GlassPanel className="h-fit p-5">
          <h2 className="text-base font-semibold text-fg">
            {t("dashboard.audienceVerification")}
          </h2>
          {verifiedKits > 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("dashboard.audienceVerifiedNote", {
                count: verifiedKits,
                total: kits.length,
                platformWord: t(
                  kits.length === 1 ? "dashboard.platformSingular" : "dashboard.platformPlural",
                ),
              })}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("dashboard.audienceUnverifiedNote")}{" "}
              {t("dashboard.audienceUnverifiedCanUpgrade")}
            </p>
          )}
          <Link
            href={`${basePath}/media-kit`}
            className="mt-3 inline-block text-xs text-accent transition hover:brightness-125"
          >
            {t("dashboard.openMediaKit")}
          </Link>
        </GlassPanel>
      </div>
    </>
  );
}

