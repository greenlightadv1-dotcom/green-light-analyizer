"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupBanner } from "@/components/onboarding/SetupBanner";
import { companyDetailsComplete, companyOnboarding } from "@/lib/onboarding";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { DealChatListItem } from "@/lib/deals/queries";
import type { Profile } from "@/lib/auth";
import { useTranslation } from "@/components/LocaleProvider";

const SPONSORSHIP_TYPE_KEYS: Record<string, string> = {
  video_dedicated: "analyzer.typeVideoDedicated",
  integration: "analyzer.typeIntegration",
  story_share: "analyzer.typeStoryShare",
  live_mention: "analyzer.typeLiveMention",
  post: "analyzer.typePost",
  other: "analyzer.typeOther",
};

/**
 * Company dashboard, presentation only — the counterpart to
 * DashboardView. Split out rather than branched inline because the two roles
 * genuinely have nothing in common here: a company has no inbound alias, no
 * media kit, and no audience-verification prompt to show.
 */
export function CompanyDashboardView({
  profile,
  chats,
}: {
  profile: Profile;
  chats: DealChatListItem[];
}) {
  const { t } = useTranslation();
  const recent = chats.slice(0, 5);
  const openDeals = chats.filter(
    (c) => c.deal_status !== "paid" && c.deal_status !== "disputed",
  ).length;
  const setup = companyOnboarding(profile, { kitCount: 0, analyticsConnected: false, emailDealSeen: false, representsCompany: null });

  return (
    <>
      <SectionHeader
        title={t("dashboard.welcomeBack", { name: profile.full_name.split(" ")[0] })}
        description={t("companyDashboard.subtitle")}
        action={
          <Link href="/discover">
            <Button fullWidth={false}>{t("companyDashboard.discoverCreators")}</Button>
          </Link>
        }
      />

      {profile.role === "company" && !setup.complete ? (
        <SetupBanner done={setup.done} total={setup.required} gatedNote={!companyDetailsComplete(profile)} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-5">
          <p className="text-xs font-medium text-fg-muted">
            {t("dashboard.openDeals")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {openDeals}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {t("companyDashboard.openDealsTotal", { count: chats.length })}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs font-medium text-fg-muted">
            {t("companyDashboard.commission")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg">
            {t("companyDashboard.commissionValue")}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {t("companyDashboard.freeNote")}
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4">
        {recent.length === 0 ? (
          <EmptyState
            title={t("companyDashboard.noDealsTitle")}
            body={t("companyDashboard.noDealsBody")}
            action={{ href: "/discover", label: t("companyDashboard.discoverCreators") }}
          />
        ) : (
          <GlassPanel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-fg">
                {t("dashboard.recentDeals")}
              </h2>
              <Link
                href="/inbox"
                className="text-xs text-fg-muted transition hover:text-fg focus-visible:focus-ring"
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
                      {chat.sponsorship_type
                        ? t(SPONSORSHIP_TYPE_KEYS[chat.sponsorship_type] ?? "analyzer.typeOther")
                        : t("inbox.unspecifiedDeliverable")}
                    </span>
                    <span className="text-sm text-fg-secondary tabular-nums">
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
    </>
  );
}
