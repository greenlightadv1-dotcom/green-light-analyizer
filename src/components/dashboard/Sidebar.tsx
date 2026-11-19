"use client";

import Link from "next/link";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import type { Role } from "@/lib/types/database";
import { NavLinks } from "./NavLinks";

export function Sidebar({
  role,
  basePath = "",
}: {
  role: Role;
  /** Prefix for every link. Used by the UI preview to stay within /preview. */
  basePath?: string;
}) {
  return (
    <aside className="glass-panel-solid sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col overflow-y-auto p-3 lg:flex">
      <Link href={`${basePath}/dashboard`} className="mb-5 block w-fit rounded-full px-3 pt-2 focus-visible:focus-ring">
        <ThemedLogo size={34} />
      </Link>

      <NavLinks role={role} basePath={basePath} />

    </aside>
  );
}
