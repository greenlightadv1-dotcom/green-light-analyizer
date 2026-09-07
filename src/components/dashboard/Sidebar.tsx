"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/Logo";
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
      <Link href={`${basePath}/dashboard`} className="mb-8 block px-2 pt-2">
        {/* Dark surface -> dark lockup (§2.3). */}
        <Logo variant="dark" height={30} />
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
              className={`rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-brand-green/12 font-medium text-brand-green"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-6">
        <LogoMark size={20} className="opacity-40" />
      </div>
    </aside>
  );
}
