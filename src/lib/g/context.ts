import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listMediaKits } from "@/lib/media-kit/queries";
import { listCreatorDirectory } from "@/lib/deals/directory";
import { log } from "@/lib/log";
import type { Profile } from "@/lib/auth";
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
  };
}
