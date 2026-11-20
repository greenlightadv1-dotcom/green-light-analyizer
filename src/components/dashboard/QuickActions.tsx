"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";

export type QuickAction = { href: string; labelKey: string; descKey: string };

/**
 * The dashboard's shortcuts: the few pages a role opens most, one click from
 * home, each with a one-line reason to go there. Links only, no figures, so
 * nothing here can disagree with the page it opens.
 */
export function QuickActions({ actions, basePath = "" }: { actions: readonly QuickAction[]; basePath?: string }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="quick-actions" className="mb-6">
      <h2 id="quick-actions" className="sr-only">{t("dashboard.quickActions")}</h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={`${basePath}${a.href}`}
              className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-forest/30 hover:bg-lime-soft focus-visible:focus-ring"
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-fg">
                {t(a.labelKey)}
                <span aria-hidden className="text-accent rtl:rotate-180">→</span>
              </span>
              <span className="mt-1 text-xs leading-relaxed text-fg-muted">{t(a.descKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const CREATOR_ACTIONS: readonly QuickAction[] = [
  { href: "/analyzer", labelKey: "nav.analyzer", descKey: "dashboard.qa.analyzer" },
  { href: "/opportunities", labelKey: "nav.opportunities", descKey: "dashboard.qa.opportunities" },
  { href: "/media-kit", labelKey: "nav.mediaKit", descKey: "dashboard.qa.mediaKit" },
  { href: "/content", labelKey: "nav.content", descKey: "dashboard.qa.content" },
];

export const COMPANY_ACTIONS: readonly QuickAction[] = [
  { href: "/discover", labelKey: "nav.discover", descKey: "dashboard.qa.discover" },
  { href: "/briefs", labelKey: "nav.briefs", descKey: "dashboard.qa.briefs" },
  { href: "/shortlists", labelKey: "nav.shortlists", descKey: "dashboard.qa.shortlists" },
  { href: "/collaborations", labelKey: "nav.collaborations", descKey: "dashboard.qa.collaborations" },
];

export const ADMIN_ACTIONS: readonly QuickAction[] = [
  { href: "/admin/requests", labelKey: "nav.adminRequests", descKey: "dashboard.qa.adminRequests" },
  { href: "/admin/verification", labelKey: "nav.adminVerification", descKey: "dashboard.qa.adminVerification" },
  { href: "/admin/users", labelKey: "nav.adminUsers", descKey: "dashboard.qa.adminUsers" },
  { href: "/admin/violations", labelKey: "nav.adminViolations", descKey: "dashboard.qa.adminViolations" },
  { href: "/admin/relays", labelKey: "nav.adminRelays", descKey: "dashboard.qa.adminRelays" },
  { href: "/inbox", labelKey: "nav.inbox", descKey: "dashboard.qa.adminInbox" },
  { href: "/collaborations", labelKey: "nav.collaborations", descKey: "dashboard.qa.adminCollaborations" },
  { href: "/admin/system", labelKey: "nav.adminSystem", descKey: "dashboard.qa.adminSystem" },
];
