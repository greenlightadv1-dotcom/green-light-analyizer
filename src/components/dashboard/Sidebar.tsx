"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import type { Role } from "@/lib/types/database";

type NavItem = {
  href: string;
  label: string;
  roles: Role[];
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["creator", "company", "admin"] },
  { href: "/inbox", label: "Deal inbox", roles: ["creator", "company", "admin"] },
  { href: "/discover", label: "Discover creators", roles: ["company", "admin"] },
  { href: "/analyzer", label: "Manual analyzer", roles: ["creator", "admin"] },
  { href: "/media-kit", label: "Media kit", roles: ["creator", "admin"] },
  { href: "/settings", label: "Settings", roles: ["creator", "company", "admin"] },
  { href: "/admin/users", label: "Accounts", roles: ["admin"] },
  { href: "/admin/promo-codes", label: "Promo codes", roles: ["admin"] },
  { href: "/admin/violations", label: "Violations", roles: ["admin"] },
  { href: "/admin/system", label: "System", roles: ["admin"] },
];

export function Sidebar({
  role,
  basePath = "",
}: {
  role: Role;
  /** Prefix for every link. Used by the UI preview to stay within /preview. */
  basePath?: string;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role));

  return (
    <aside className="glass-panel-solid sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col p-4 lg:flex">
      <Link href={`${basePath}/dashboard`} className="mb-6 block px-2 pt-2">
        <ThemedLogo size={34} />
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const href = `${basePath}${item.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-xl border-l-2 py-2.5 pr-3 pl-2.5 text-sm transition ${
                active
                  ? "border-brand-green bg-brand-green/12 font-medium text-brand-green"
                  : "border-transparent text-fg/60 hover:translate-x-0.5 hover:bg-fg/5 hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-5">
        <ThemedLogo size={20} className="opacity-40" />
      </div>
    </aside>
  );
}
