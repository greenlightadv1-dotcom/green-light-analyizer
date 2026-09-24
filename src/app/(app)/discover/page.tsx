import type { Metadata } from "next";
import { DiscoverView } from "@/components/views/DiscoverView";
import { requireRole } from "@/lib/auth";
import { listCreatorDirectory } from "@/lib/deals/directory";

export const metadata: Metadata = { title: "Discover creators" };
/**
 * Server actions run inside this route segment's function, and the ones
 * reachable from this page call the model (src/lib/ai/chat.ts), which budgets
 * up to 50s across its attempts. Without this the segment runs on Vercel's
 * default timeout — well under that — so the platform killed the request
 * before the AI budget was anywhere near spent, and the creator got a dead
 * page rather than the rule-based fallback. 60s is the Hobby ceiling.
 */
export const maxDuration = 60;


/**
 * §3: "company: browses/creates offers to creators." Company-only (admin can
 * reach it too, for support/testing) — a creator has nothing to browse here.
 */
export default async function DiscoverPage() {
  await requireRole("company", "admin");
  const creators = await listCreatorDirectory();

  return <DiscoverView creators={creators} />;
}
