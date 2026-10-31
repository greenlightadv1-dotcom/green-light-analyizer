import type { Metadata } from "next";
import { DiscoverView } from "@/components/views/DiscoverView";
import { requireRole } from "@/lib/auth";
import { listCreatorDirectory } from "@/lib/deals/directory";
import { filterDirectory, hasFreshVerifiedGeo, parseDiscoveryQuery } from "@/lib/discovery";
import type { DirectoryRow } from "@/lib/g/recommend";
import type { DiscoverEntry } from "@/components/views/DiscoverView";

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
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("company", "admin");
  const params = await searchParams;
  const rows = (await listCreatorDirectory()) as unknown as DirectoryRow[];
  const query = parseDiscoveryQuery(params);
  const now = new Date();
  // Filtering, sorting and paging happen here, on the server, over the rows
  // the RPC already authorized; the browser receives one page.
  const { items, total, page, pages } = filterDirectory(rows, query, now);
  const withFreshness = (r: DirectoryRow): DiscoverEntry =>
    ({ ...r, freshVerified: hasFreshVerifiedGeo(r, now) }) as unknown as DiscoverEntry;
  const selectedId = typeof params.creator === "string" ? params.creator : null;
  const selectedRow = selectedId ? rows.find((r) => r.creator_id === selectedId) ?? null : null;

  return (
    <DiscoverView
      items={items.map(withFreshness)}
      total={total}
      page={page}
      pages={pages}
      query={query}
      selected={selectedRow ? withFreshness(selectedRow) : null}
      directoryEmpty={rows.length === 0}
    />
  );
}
