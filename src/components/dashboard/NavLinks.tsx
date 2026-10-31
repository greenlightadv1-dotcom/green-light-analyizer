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
            className={`rounded-xl border-s-2 py-2.5 ps-2.5 pe-3 text-sm transition ${
              active
                ? "border-brand-green bg-brand-green/12 font-medium text-brand-green"
                : "border-transparent text-fg/60 hover:translate-x-0.5 rtl:hover:-translate-x-0.5 hover:bg-fg/5 hover:text-fg"
            }`}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
