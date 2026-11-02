import type { Metadata } from "next";
import { DiscoverView } from "@/components/views/DiscoverView";
import { requireRole } from "@/lib/auth";
import { listCreatorDirectory } from "@/lib/deals/directory";
import { filterDirectory, hasFreshVerifiedGeo, parseDiscoveryQuery } from "@/lib/discovery";
import type { DirectoryRow } from "@/lib/g/recommend";
import type { DiscoverEntry } from "@/components/views/DiscoverView";
import { createClient } from "@/lib/supabase/server";

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
  const profile = await requireRole("company", "admin");
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

  // The company's own lists (RLS: shortlists are owner-only) and whether the
  // selected creator is already in each. Missing tables (0028 not applied)
  // simply mean no lists.
  let shortlists: { id: string; name: string; hasCreator: boolean }[] | null = null;
  if (profile.role === "company") {
    const supabase = await createClient();
    const { data: lists } = await supabase.from("shortlists").select("id, name").order("name").limit(20);
    const { data: entries } = selectedRow && lists?.length
      ? await supabase.from("shortlist_entries").select("shortlist_id").eq("creator_id", selectedRow.creator_id)
      : { data: [] as { shortlist_id: string }[] };
    const inList = new Set((entries ?? []).map((e) => e.shortlist_id));
    shortlists = (lists ?? []).map((l) => ({ id: l.id, name: l.name, hasCreator: inList.has(l.id) }));
  }

  return (
    <DiscoverView
      shortlists={shortlists}
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
