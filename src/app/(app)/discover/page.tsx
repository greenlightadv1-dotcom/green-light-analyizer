import type { Metadata } from "next";
import { DiscoverView } from "@/components/views/DiscoverView";
import { requireRole } from "@/lib/auth";
import { listCreatorDirectory } from "@/lib/deals/directory";

export const metadata: Metadata = { title: "Discover creators" };

/**
 * §3: "company: browses/creates offers to creators." Company-only (admin can
 * reach it too, for support/testing) — a creator has nothing to browse here.
 */
export default async function DiscoverPage() {
  await requireRole("company", "admin");
  const creators = await listCreatorDirectory();

  return <DiscoverView creators={creators} />;
}
