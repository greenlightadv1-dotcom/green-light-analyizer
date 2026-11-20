"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ADMIN_ACTIONS, QuickActions } from "@/components/dashboard/QuickActions";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * Admin home. Admins have no inbound alias, media kit or deals of their own,
 * so the creator dashboard's cards were empty or misleading for them; this is
 * a directory of the pages where admin work happens. Links only: each page
 * loads and authorizes its own data.
 */
export function AdminDashboardView() {
  const { t } = useTranslation();
  return (
    <>
      <SectionHeader title={t("dashboard.adminTitle")} description={t("dashboard.adminSubtitle")} />
      <QuickActions actions={ADMIN_ACTIONS} />
    </>
  );
}
