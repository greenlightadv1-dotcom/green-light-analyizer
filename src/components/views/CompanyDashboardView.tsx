"use client";

import Link from "next/link";
import { CtaLink } from "@/components/landing/CtaLink";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SetupBanner } from "@/components/onboarding/SetupBanner";
import { companyDetailsComplete, companyOnboarding } from "@/lib/onboarding";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { DealList } from "@/components/dashboard/DealList";
import { COMPANY_ACTIONS, QuickActions } from "@/components/dashboard/QuickActions";
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
          <CtaLink href="/discover" className="hidden sm:inline-flex">{t("companyDashboard.discoverCreators")}</CtaLink>
        }
      />

      {profile.role === "company" && !setup.complete ? (
        <SetupBanner done={setup.done} total={setup.required} gatedNote={!companyDetailsComplete(profile)} />
      ) : null}

      <QuickActions actions={COMPANY_ACTIONS} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-lime flex flex-col p-5 sm:p-6">
          <p className="text-sm font-semibold text-ink/75">
            {t("dashboard.openDeals")}
          </p>
          <p className="mt-2 text-4xl font-bold text-ink tabular-nums sm:text-5xl">
            {openDeals}
          </p>
          <p className="mt-auto pt-4 text-xs font-medium text-ink/70">
            {t("companyDashboard.openDealsTotal", { count: chats.length })}
          </p>
        </div>

        <GlassPanel className="p-5 sm:p-6">
          <p className="text-sm font-medium text-fg-muted">
            {t("companyDashboard.commission")}
          </p>
          <p className="mt-2 text-lg font-bold text-fg sm:text-2xl">
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
          <DealList
            chats={recent}
            total={chats.length}
            title={(chat) => ({
              text: chat.sponsorship_type
                ? t(SPONSORSHIP_TYPE_KEYS[chat.sponsorship_type] ?? "analyzer.typeOther")
                : t("inbox.unspecifiedDeliverable"),
            })}
          />
        )}
      </div>
    </>
  );
}
