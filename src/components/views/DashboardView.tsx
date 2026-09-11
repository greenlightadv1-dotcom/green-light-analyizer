"use client";

import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { canVerifyAudience } from "@/lib/media-kit/platforms";
import { isProfileIncomplete } from "@/lib/media-kit/profile-completeness";
import type { DealChatListItem } from "@/lib/deals/queries";
import type { MediaKit } from "@/lib/media-kit/queries";
import type { Profile } from "@/lib/auth";

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
}: {
  profile: Profile;
  chats: DealChatListItem[];
  kits: MediaKit[];
}) {
  const { t } = useTranslation();
  const recent = chats.slice(0, 5);
  const openDeals = chats.filter(
    (c) => c.deal_status !== "paid" && c.deal_status !== "disputed",
  ).length;
  const verifiedKits = kits.filter((k) => k.audience_verified).length;
  const plan = profile.subscription_plan ?? "Starter";
  const incompleteProfile = isProfileIncomplete(profile, kits);

  return (
    <>
      <SectionHeader
        title={t("dashboard.welcomeBack", { name: profile.full_name.split(" ")[0] })}
        description={t("dashboard.subtitle")}
      />

      {incompleteProfile ? (
        <Link
          href="/media-kit"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-green/25 bg-brand-green/8 px-5 py-4 transition hover:bg-brand-green/12"
        >
          <div>
            <p className="text-sm font-semibold text-fg">{t("dashboard.completeProfileTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg/55">{t("dashboard.completeProfileBody")}</p>
          </div>
          <span className="shrink-0 text-xs font-medium text-brand-green">
            {t("dashboard.completeProfileCta")}
          </span>
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            {t("dashboard.openDeals")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {openDeals}
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {t("dashboard.pricingNote", { region: profile.region ?? "MENA", plan })}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs tracking-wide text-fg/45 uppercase">
              {t("dashboard.inboundAlias")}
            </p>
            {profile.inbound_alias ? <CopyButton value={profile.inbound_alias} /> : null}
          </div>
          <p className="mt-2 rounded-xl border border-fg/10 bg-navy-dark/70 px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
            {profile.inbound_alias ?? t("dashboard.notIssuedYet")}
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {t("dashboard.forwardEmailNote")}
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {recent.length === 0 ? (
            <EmptyState
              title={t("dashboard.noDealsYetTitle")}
              spec="§5, §6.2"
              body={t("dashboard.noDealsYetBody")}
            />
          ) : (
            <GlassPanel className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-fg">
                  {t("dashboard.recentDeals")}
                </h2>
                <Link
                  href="/inbox"
                  className="text-xs text-fg/45 transition hover:text-fg/80"
                >
                  {t("dashboard.viewAll", { count: chats.length })}
                </Link>
              </div>

              <ul className="divide-y divide-fg/5">
                {recent.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      href={`/inbox/${chat.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition hover:bg-fg/4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-green"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {chat.sender_email}
                      </span>
                      <span className="text-sm text-fg/70 tabular-nums">
                        {chat.offered_amount === null
                          ? "—"
                          : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                      </span>
                      <StatusBadge status={chat.deal_status} />
                      <RiskBadge risk={chat.ai_evaluation} />
                    </Link>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          )}
        </div>

        {/*
          §7.2/§7.4 made concrete: the reason to connect analytics is that
          unverified geography caps a high-value deal at yellow. Saying that
          beats a generic "connect your accounts" prompt.
        */}
        <GlassPanel className="h-fit p-5">
          <h2 className="text-sm font-semibold text-fg">
            {t("dashboard.audienceVerification")}
          </h2>
          {verifiedKits > 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-fg/55">
              {t("dashboard.audienceVerifiedNote", {
                count: verifiedKits,
                total: kits.length,
                platformWord: t(
                  kits.length === 1 ? "dashboard.platformSingular" : "dashboard.platformPlural",
                ),
              })}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-fg/55">
              {t("dashboard.audienceUnverifiedNote")}{" "}
              {canVerifyAudience(plan)
                ? t("dashboard.audienceUnverifiedCanUpgrade")
                : t("dashboard.audienceUnverifiedIncluded")}
            </p>
          )}
          <Link
            href="/media-kit"
            className="mt-3 inline-block text-xs text-brand-green transition hover:brightness-125"
          >
            {t("dashboard.openMediaKit")}
          </Link>
        </GlassPanel>
      </div>
    </>
  );
}

