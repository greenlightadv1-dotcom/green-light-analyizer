import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listMediaKits } from "@/lib/media-kit/queries";
import { listCreatorDirectory } from "@/lib/deals/directory";
import { log } from "@/lib/log";
import type { Profile } from "@/lib/auth";
import type { DeliverableStatus } from "@/lib/types/database";
import { countDeliverables, nextStep, type CollabSummary, type InvitationSummary } from "./collab";
import { assessCreator, type CreatorAssessment, type DealSummary } from "./assessment";
import {
  compareCreators,
  missingBriefFields,
  parseBrief,
  recommendCreators,
  type Brief,
  type DirectoryRow,
  type Recommendation,
} from "./recommend";

/**
 * G's authenticated context (feature 7F). Everything here is read with the
 * caller's own Supabase client, so RLS scopes every row to them:
 *   - a creator reads only their own profile, media kits and deals;
 *   - a company reads only its own deals, plus the Discovery directory through
 *     the creator_directory() RPC, which returns no PII and nothing for a
 *     creator caller;
 *   - an admin gets navigation help only — G never summarizes other users'
 *     data for anyone.
 * The identity is the session's. Nothing from the request body chooses whose
 * data is read.
 */

export { loadApiSession as loadGSession } from "@/lib/api-session";

const DEAL_COLUMNS =
  "id, deal_status, sponsorship_type, offered_amount, recommended_price_usd, ai_evaluation, created_at";

async function ownDeals(profile: Profile): Promise<DealSummary[]> {
  const supabase = await createClient();
  const column = profile.role === "company" ? "company_id" : "creator_id";
  const { data, error } = await supabase
    .from("deal_chats")
    .select(DEAL_COLUMNS)
    .eq(column, profile.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) log.warn("g.deals_read_failed", { error });
  return (data ?? []) as DealSummary[];
}

export type CreatorGData = {
  assessment: CreatorAssessment;
  recentDeals: DealSummary[];
  dealIds: Set<string>;
};

export async function creatorContext(profile: Profile): Promise<CreatorGData> {
  const [kits, deals] = await Promise.all([listMediaKits(profile.id), ownDeals(profile)]);
  return {
    assessment: assessCreator(profile, kits, deals),
    recentDeals: deals.slice(0, 5),
    dealIds: new Set(deals.map((d) => d.id)),
  };
}

export type CompanyGData = {
  brief: Brief;
  briefMissing: string[];
  directorySize: number;
  recommendations: Recommendation[];
  comparison: ReturnType<typeof compareCreators> | null;
  recentDeals: DealSummary[];
  dealIds: Set<string>;
  creatorIds: Set<string>;
  /** Display names from the authorized directory, for prepared invitations. */
  creatorNames: Map<string, string>;
};

export async function companyContext(
  profile: Profile,
  rawBrief: unknown,
  compareIds: readonly string[],
): Promise<CompanyGData> {
  const [directory, deals] = await Promise.all([listCreatorDirectory(), ownDeals(profile)]);
  const rows = directory as unknown as DirectoryRow[];
  const brief = parseBrief(rawBrief);
  return {
    brief,
    briefMissing: missingBriefFields(brief),
    directorySize: rows.length,
    recommendations: recommendCreators(rows, brief, 5),
    comparison: compareIds.length >= 2 ? compareCreators(rows, compareIds) : null,
    recentDeals: deals.slice(0, 5),
    dealIds: new Set(deals.map((d) => d.id)),
    creatorIds: new Set(rows.map((r) => r.creator_id)),
    creatorNames: new Map(rows.map((r) => [r.creator_id, r.full_name])),
  };
}

// ---------------------------------------------------------------------------
// Collaboration lifecycle and content plans (migrations 0026–0029). Same rule:
// the caller's own client only, so RLS decides every row. Missing tables
// (migrations not applied) read as empty.
// ---------------------------------------------------------------------------

export type CollabGData = {
  collaborations: CollabSummary[];
  invitations: InvitationSummary[];
  briefs: { id: string; title: string; status: string; sponsorship_type: string | null; platforms: string[]; budget_min_usd: number | null; budget_max_usd: number | null; due_date: string | null }[];
  content: { counts: Record<string, number>; upcoming: { id: string; kind: string; title: string; planned_for: string; status: string }[] } | null;
  briefIds: Set<string>;
  publishedBriefIds: Set<string>;
  collaborationIds: Set<string>;
  invited: Set<string>;
};

export async function collabContext(profile: Profile): Promise<CollabGData> {
  const supabase = await createClient();
  const side = profile.role === "company" ? "company" : "creator";
  const column = side === "company" ? "company_id" : "creator_id";
  const [{ data: collabs }, { data: invites }, { data: briefRows }] = await Promise.all([
    supabase.from("collaborations").select("id, brief_id, status, proposed_terms, company_confirmed_at, creator_confirmed_at, agreed_amount_usd").eq(column, profile.id).order("updated_at", { ascending: false }).limit(20),
    supabase.from("invitations").select("id, brief_id, creator_id, status, proposed_amount_usd").eq(column, profile.id).order("updated_at", { ascending: false }).limit(50),
    side === "company"
      ? supabase.from("briefs").select("id, title, status, sponsorship_type, platforms, budget_min_usd, budget_max_usd, due_date").eq("company_id", profile.id).order("updated_at", { ascending: false }).limit(20)
      : supabase.from("briefs").select("id, title, status, sponsorship_type, platforms, budget_min_usd, budget_max_usd, due_date").eq("status", "published").order("published_at", { ascending: false }).limit(10),
  ]);
  const ids = (collabs ?? []).map((c) => c.id);
  const { data: dels } = ids.length
    ? await supabase.from("deliverables").select("collaboration_id, status").in("collaboration_id", ids)
    : { data: [] as { collaboration_id: string; status: DeliverableStatus }[] };
  const briefIdsNeeded = [...new Set([...(collabs ?? []), ...(invites ?? [])].map((r) => r.brief_id))];
  const { data: titleRows } = briefIdsNeeded.length
    ? await supabase.from("briefs").select("id, title").in("id", briefIdsNeeded)
    : { data: [] as { id: string; title: string }[] };
  const title = new Map((titleRows ?? []).map((b) => [b.id, b.title]));

  let content: CollabGData["content"] = null;
  if (side === "creator") {
    const { data: items } = await supabase.from("content_items").select("id, kind, title, status, planned_for").eq("creator_id", profile.id).limit(500);
    const counts: Record<string, number> = {};
    for (const i of items ?? []) counts[i.status] = (counts[i.status] ?? 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (items ?? [])
      .filter((i): i is typeof i & { planned_for: string } => !!i.planned_for && i.planned_for >= today && i.status !== "archived" && i.status !== "published")
      .sort((a, b) => a.planned_for.localeCompare(b.planned_for))
      .slice(0, 5);
    content = { counts, upcoming };
  }

  const briefs = briefRows ?? [];
  return {
    collaborations: (collabs ?? []).map((c) => {
      const ds = (dels ?? []).filter((d) => d.collaboration_id === c.id);
      return {
        id: c.id,
        title: title.get(c.brief_id) ?? "",
        status: c.status,
        side,
        agreed_amount_usd: c.agreed_amount_usd,
        deliverables: countDeliverables(ds),
        next: nextStep(side, c, ds),
      };
    }),
    invitations: (invites ?? []).map((i) => ({ id: i.id, title: title.get(i.brief_id) ?? "", status: i.status, proposed_amount_usd: i.proposed_amount_usd })),
    briefs,
    content,
    briefIds: new Set(side === "company" ? briefs.map((b) => b.id) : []),
    publishedBriefIds: new Set(side === "company" ? briefs.filter((b) => b.status === "published").map((b) => b.id) : []),
    collaborationIds: new Set(ids),
    invited: new Set((invites ?? []).map((i) => `${i.brief_id}:${i.creator_id}`)),
  };
}
