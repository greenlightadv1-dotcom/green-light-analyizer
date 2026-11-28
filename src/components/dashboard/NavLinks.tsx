"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import type { Role } from "@/lib/types/database";
import { NotificationDot } from "@/components/ui/NotificationDot";
import type { BadgeHref } from "@/lib/notifications/rules";
import { isActivePath, navSectionsForRole, sectionLabelKey } from "./nav";
import { useNavBadges } from "./useNavBadges";

/**
 * The role-filtered link list, shared by the desktop Sidebar and the mobile
 * drawer so both always show exactly the same links (nav.ts). Sections are
 * plain headings over the list: nothing is collapsed or nested, so every
 * destination is visible and one click away.
 */
export function NavLinks({
  role,
  basePath = "",
  onNavigate,
}: {
  role: Role;
  /** Prefix for every link. Used by the UI preview to stay within /preview. */
  basePath?: string;
  /** Called when a link is chosen — the mobile drawer closes itself on it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const badges = useNavBadges(basePath);

  return (
    <nav className="flex flex-col gap-4">
      {navSectionsForRole(role).map(({ section, items }) => {
        const heading = sectionLabelKey(section, role);
        return (
          <div key={section} role="group" aria-label={heading ? t(heading) : undefined}>
            {heading ? (
              <p className="mb-1 px-4 text-xs font-semibold text-fg-muted">{t(heading)}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const href = `${basePath}${item.href}`;
                const active = isActivePath(pathname, href);
                const count = badges[item.href as BadgeHref] ?? 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between gap-2 rounded-full px-4 py-2 text-sm transition-colors focus-visible:focus-ring ${
                        active
                          ? "bg-forest font-semibold text-white dark:bg-brand-green dark:text-ink"
                          : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                      }`}
                    >
                      <span>{t(item.labelKey)}</span>
                      <NotificationDot count={count} label={t("notifications.navUnread", { count })} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
