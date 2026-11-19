"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import type { Role } from "@/lib/types/database";
import { isActivePath, navItemsForRole } from "./nav";

/**
 * The role-filtered link list, shared by the desktop Sidebar and the mobile
 * drawer so both always show exactly the same links (nav.ts).
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

  return (
    <nav className="flex flex-col gap-1">
      {navItemsForRole(role).map((item) => {
        const href = `${basePath}${item.href}`;
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={item.href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center rounded-full px-4 py-2.5 text-sm transition-colors focus-visible:focus-ring ${
              active
                ? "bg-forest font-semibold text-white dark:bg-brand-green dark:text-ink"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg"
            }`}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
