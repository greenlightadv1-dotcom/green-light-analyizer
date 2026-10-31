import type { Platform } from "../types/database.ts";
import { INTEGRATION_STATUS, type IntegrationStatus } from "../media-kit/platforms.ts";
import { knownCategories } from "../taxonomy.ts";
import type { GActionId } from "./actions.ts";
import { isFresh, metric, toShares, type CountryShare, type Metric, type Provenance } from "./provenance.ts";

/**
 * Creator channel assessment for G (feature 7D).
 *
 * Built only from the creator's own stored data. It never invents a number,
 * never calls a channel "verified" unless the data is, and uses only two
 * thresholds, both Green Light's own pricing defaults from lib/ai/heuristic.ts
 * (engagement under ~1% suggests inflated reach, above ~4% is healthy). Those
 * are labelled as Green Light defaults, not market benchmarks, wherever they
 * are shown.
 *
 * Findings are codes, not prose: the client words them in the user's
 * language (`g.finding.*`), and the model may only explain them.
 *
 * Pure — unit-tested in assessment.test.ts.
 */

export const ENGAGEMENT_LOW_PCT = 1;
export const ENGAGEMENT_HEALTHY_PCT = 4;

export type KitInput = {
  platform: Platform;
  avg_views: number | null;
  avg_ccv: number | null;
  engagement_rate: number | null;
  content_category: string | null;
  content_language: string | null;
  declared_top_countries: unknown;
  verified_top_countries: unknown;
  audience_verified: boolean | null;
  verified_geo_synced_at?: string | null;
  analytics_oauth_connected?: boolean | null;
  subscriber_count?: number | null;
  channel_view_count?: number | null;
  media_count?: number | null;
  youtube_stats_synced_at?: string | null;
};

export type CreatorProfileInput = {
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  country: string | null;
  primary_language: string | null;
  base_rate_usd: number | null;
  social_links: Record<string, unknown> | null;
  shareable_slug: string | null;
  inbound_alias: string | null;
  creator_categories?: string[] | null;
  creator_games?: string[] | null;
  content_formats?: string[] | null;
};

export type DealStatus = "new" | "negotiating" | "agreed" | "paid" | "disputed";
export type DealSummary = {
  id: string;
  deal_status: DealStatus;
  sponsorship_type: string | null;
  offered_amount: number | null;
  recommended_price_usd: number | null;
  ai_evaluation: "green" | "yellow" | "red" | null;
  created_at: string | null;
};

export type Finding = { code: string; platform?: Platform; params?: Record<string, string | number> };

export type PlatformAssessment = {
  platform: Platform;
  integration: IntegrationStatus;
  metrics: Metric[];
  geography: { shares: CountryShare[]; provenance: Provenance; asOf: string | null };
};

export type Completeness = { done: number; total: number; missing: string[] };

export type CreatorAssessment = {
  platforms: PlatformAssessment[];
  profile: Completeness;
  mediaKit: Completeness;
  strengths: Finding[];
  improvements: Finding[];
  missing: Finding[];
  deals: { total: number; byStatus: Record<DealStatus, number>; open: number };
  nextActions: GActionId[];
};

function geographyOf(kit: KitInput, now: Date): PlatformAssessment["geography"] {
  const verified = toShares(kit.verified_top_countries);
  if (kit.audience_verified && verified.length) {
    if (isFresh(kit.verified_geo_synced_at, now)) {
      return { shares: verified.slice(0, 5), provenance: "verified", asOf: kit.verified_geo_synced_at ?? null };
    }
    return { shares: [], provenance: "stale", asOf: kit.verified_geo_synced_at ?? null };
  }
  const declared = toShares(kit.declared_top_countries);
  if (declared.length) return { shares: declared.slice(0, 5), provenance: "self_reported", asOf: null };
  return { shares: [], provenance: "missing", asOf: null };
}

function platformMetrics(kit: KitInput, now: Date): Metric[] {
  const out: Metric[] = [
    // Typed by the creator in the Media Kit form.
    metric("avg_views", kit.avg_views, "self_reported"),
    metric("avg_ccv", kit.avg_ccv, "self_reported"),
    // Mixed provenance (form or sync) with no record of which: shown as
    // self-reported, the conservative label (CLAUDE.md §12, G1).
    metric("engagement_rate", kit.engagement_rate, "self_reported"),
  ];
  if (kit.platform === "youtube") {
    const synced = isFresh(kit.youtube_stats_synced_at, now) ? "synced" : "stale";
    const asOf = kit.youtube_stats_synced_at ?? null;
    out.push(
      metric("subscribers", kit.subscriber_count, synced, asOf),
      metric("lifetime_views", kit.channel_view_count, synced, asOf),
      metric("videos", kit.media_count, synced, asOf),
    );
  }
  return out;
}

function completeness(checks: [string, boolean][]): Completeness {
  const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return { done: checks.length - missing.length, total: checks.length, missing };
}

export function assessCreator(
  profile: CreatorProfileInput,
  kits: readonly KitInput[],
  deals: readonly DealSummary[],
  now: Date = new Date(),
): CreatorAssessment {
  const platforms = kits.map((kit) => ({
    platform: kit.platform,
    integration: INTEGRATION_STATUS[kit.platform],
    metrics: platformMetrics(kit, now),
    geography: geographyOf(kit, now),
  }));

  const socials = Object.values(profile.social_links ?? {}).filter((v) => typeof v === "string" && v.trim());
  const profileC = completeness([
    ["name", !!profile.full_name?.trim()],
    ["bio", !!profile.bio?.trim()],
    ["avatar", !!profile.avatar_url],
    ["country", !!profile.country],
    ["language", !!profile.primary_language],
    ["categories", knownCategories(profile.creator_categories).length > 0],
    ["socials", socials.length > 0],
    ["base_rate", profile.base_rate_usd !== null && profile.base_rate_usd !== undefined],
  ]);

  const kitChecks: [string, boolean][] = [["platform", kits.length > 0]];
  if (kits.length) {
    kitChecks.push(
      ["reach", kits.every((k) => k.avg_views !== null && k.avg_views > 0)],
      ["engagement", kits.every((k) => k.engagement_rate !== null)],
      ["kit_category", kits.every((k) => !!k.content_category)],
      ["kit_language", kits.every((k) => !!k.content_language)],
      ["geography", platforms.every((p) => p.geography.provenance !== "missing")],
    );
  }
  const mediaKitC = completeness(kitChecks);

  const strengths: Finding[] = [];
  const improvements: Finding[] = [];
  const missing: Finding[] = [];

  for (const p of platforms) {
    if (p.geography.provenance === "verified") strengths.push({ code: "verified_geography", platform: p.platform });
    if (p.geography.provenance === "stale") improvements.push({ code: "geography_stale", platform: p.platform });
    if (p.geography.provenance === "missing") missing.push({ code: "no_geography", platform: p.platform });
    if (p.geography.provenance === "self_reported" && INTEGRATION_STATUS[p.platform] === "available") {
      improvements.push({ code: "connect_analytics", platform: p.platform });
    }
    const eng = p.metrics.find((m) => m.key === "engagement_rate");
    if (typeof eng?.value === "number") {
      if (eng.value >= ENGAGEMENT_HEALTHY_PCT) {
        strengths.push({ code: "engagement_healthy", platform: p.platform, params: { pct: eng.value, threshold: ENGAGEMENT_HEALTHY_PCT } });
      } else if (eng.value < ENGAGEMENT_LOW_PCT) {
        improvements.push({ code: "engagement_low", platform: p.platform, params: { pct: eng.value, threshold: ENGAGEMENT_LOW_PCT } });
      }
    } else {
      missing.push({ code: "no_engagement", platform: p.platform });
    }
    const views = p.metrics.find((m) => m.key === "avg_views");
    if (views?.provenance === "missing") missing.push({ code: "no_reach", platform: p.platform });
    if (p.metrics.some((m) => m.provenance === "stale" && m.value !== null)) {
      improvements.push({ code: "stats_stale", platform: p.platform });
    }
    if (p.integration === "manual") improvements.push({ code: "manual_only", platform: p.platform });
  }
  if (!kits.length) missing.push({ code: "no_platforms" });
  if (kits.length >= 2) strengths.push({ code: "multi_platform", params: { count: kits.length } });
  if (knownCategories(profile.creator_categories).length) strengths.push({ code: "classified" });
  else missing.push({ code: "no_categories" });
  if (!profile.inbound_alias) missing.push({ code: "no_alias" });
  for (const field of profileC.missing) {
    if (field !== "categories") missing.push({ code: `profile_${field}` });
  }

  const byStatus: Record<DealStatus, number> = { new: 0, negotiating: 0, agreed: 0, paid: 0, disputed: 0 };
  for (const d of deals) byStatus[d.deal_status] += 1;
  const open = byStatus.new + byStatus.negotiating;

  const nextActions = new Set<GActionId>();
  if (profileC.missing.length) nextActions.add("open_onboarding");
  if (missing.some((f) => ["no_platforms", "no_geography", "no_reach", "no_engagement"].includes(f.code)) || mediaKitC.missing.length) {
    nextActions.add("open_media_kit");
  }
  if (improvements.some((f) => f.code === "connect_analytics" || f.code === "geography_stale" || f.code === "stats_stale")) {
    nextActions.add("open_connections");
  }
  if (open > 0) nextActions.add("open_inbox");

  return {
    platforms,
    profile: profileC,
    mediaKit: mediaKitC,
    strengths,
    improvements,
    missing,
    deals: { total: deals.length, byStatus, open },
    nextActions: [...nextActions],
  };
}
