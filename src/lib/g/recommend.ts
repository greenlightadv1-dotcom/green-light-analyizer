import type { Platform } from "../types/database.ts";
import { PLATFORMS } from "../media-kit/platforms.ts";
import {
  CONTENT_CATEGORIES,
  CONTENT_FORMATS,
  GAME_IDS,
  knownCategories,
  knownFormats,
  knownGames,
  type ContentCategory,
  type ContentFormat,
  type GameId,
} from "../taxonomy.ts";
import { isFresh, metric, toShares, type Metric, type Provenance } from "./provenance.ts";

/**
 * Company-side campaign briefs, creator recommendations and comparisons for G
 * (features 7E and 8).
 *
 * Inputs are rows of the authorized Discovery directory (creator_directory()
 * RPC): the same data Discovery shows, never a separate dataset and never a
 * creator's private fields. Nothing is scored on a hidden scale: a creator's
 * place in the list comes from how many of the brief's stated requirements
 * they meet, then from verified data, then from reported reach, and every
 * recommendation says which requirements are met, unmet or unknown.
 *
 * Pure — unit-tested in recommend.test.ts.
 */

export type DirectoryRow = {
  creator_id: string;
  full_name: string;
  region?: string | null;
  content_category: string | null;
  content_language: string | null;
  avg_views: number | null;
  avg_ccv: number | null;
  engagement_rate: number | string | null;
  declared_top_countries: unknown;
  verified_top_countries: unknown;
  audience_verified: boolean;
  platforms: string[] | null;
  avatar_url?: string | null;
  country?: string | null;
  creator_categories?: string[] | null;
  creator_games?: string[] | null;
  content_formats?: string[] | null;
  base_rate_usd?: number | string | null;
  verified_geo_synced_at?: string | null;
  stats_synced_at?: string | null;
};

export type Brief = {
  objective: string | null;
  categories: ContentCategory[];
  games: GameId[];
  platforms: Platform[];
  countries: string[];
  formats: ContentFormat[];
  language: string | null;
  minAvgViews: number | null;
  maxBudgetUsd: number | null;
  timeline: string | null;
};

export const EMPTY_BRIEF: Brief = {
  objective: null,
  categories: [],
  games: [],
  platforms: [],
  countries: [],
  formats: [],
  language: null,
  minAvgViews: null,
  maxBudgetUsd: null,
  timeline: null,
};

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t ? t : null;
};
const num = (v: unknown, max: number): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const list = <T extends string>(v: unknown, allowed: readonly T[], limit: number): T[] =>
  Array.isArray(v) ? allowed.filter((a) => v.includes(a)).slice(0, limit) : [];

/**
 * Validate a brief from the client. Unknown values are dropped (a brief is a
 * search, not a stored record), numbers are bounded, text is capped. Country
 * codes must be ISO-3166 alpha-2.
 */
export function parseBrief(raw: unknown): Brief {
  if (!raw || typeof raw !== "object") return { ...EMPTY_BRIEF };
  const r = raw as Record<string, unknown>;
  const countries = Array.isArray(r.countries)
    ? [...new Set(r.countries.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()))]
        .filter((c) => /^[A-Z]{2}$/.test(c))
        .slice(0, 10)
    : [];
  return {
    objective: text(r.objective, 300),
    categories: list(r.categories, CONTENT_CATEGORIES, 6),
    games: list(r.games, GAME_IDS, 12),
    platforms: list(r.platforms, PLATFORMS, 4),
    countries,
    formats: list(r.formats, CONTENT_FORMATS, 8),
    language: text(r.language, 40),
    minAvgViews: num(r.minAvgViews, 1e9),
    maxBudgetUsd: num(r.maxBudgetUsd, 1e8),
    timeline: text(r.timeline, 120),
  };
}

/** Fields a useful brief should state that this one does not. */
export function missingBriefFields(b: Brief): string[] {
  const out: string[] = [];
  if (!b.objective) out.push("objective");
  if (!b.categories.length && !b.games.length) out.push("category_or_game");
  if (!b.countries.length) out.push("countries");
  if (!b.platforms.length) out.push("platforms");
  if (b.maxBudgetUsd === null) out.push("budget");
  if (!b.timeline) out.push("timeline");
  return out;
}

export type RequirementResult = {
  requirement: string;
  status: "met" | "unmet" | "unknown";
  /** What the creator's data shows, when it shows anything. */
  detail?: string | number | null;
  provenance?: Provenance;
};

export type Recommendation = {
  creator_id: string;
  full_name: string;
  met: number;
  stated: number;
  requirements: RequirementResult[];
  metrics: Metric[];
  geography: { provenance: Provenance; top: { country: string; pct: number }[] };
};

function geography(row: DirectoryRow, now: Date) {
  const verified = toShares(row.verified_top_countries);
  // The 0024 RPC already withholds stale verified geography; this also covers
  // a pre-0024 database, where it would otherwise pass through unchecked.
  const freshKnown = row.verified_geo_synced_at === undefined ? true : isFresh(row.verified_geo_synced_at, now);
  if (row.audience_verified && verified.length && freshKnown) {
    return { provenance: "verified" as Provenance, shares: verified };
  }
  const declared = toShares(row.declared_top_countries);
  if (declared.length) return { provenance: "self_reported" as Provenance, shares: declared };
  return { provenance: "missing" as Provenance, shares: [] };
}

function rowCategories(row: DirectoryRow): ContentCategory[] {
  const own = knownCategories(row.creator_categories);
  const kit = row.content_category?.trim().toLowerCase();
  if (kit && (CONTENT_CATEGORIES as readonly string[]).includes(kit) && !own.includes(kit as ContentCategory)) {
    own.push(kit as ContentCategory);
  }
  return own;
}

const toNumber = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

export function evaluateCreator(row: DirectoryRow, brief: Brief, now: Date = new Date()): Recommendation {
  const reqs: RequirementResult[] = [];
  const geo = geography(row, now);
  const cats = rowCategories(row);
  const games = knownGames(row.creator_games);
  const formats = knownFormats(row.content_formats);
  const platforms = (row.platforms ?? []).filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  const avgViews = toNumber(row.avg_views);
  const rate = toNumber(row.base_rate_usd);

  if (brief.categories.length) {
    const hit = brief.categories.filter((c) => cats.includes(c));
    reqs.push({ requirement: "category", status: !cats.length ? "unknown" : hit.length ? "met" : "unmet", detail: hit.join(",") || null });
  }
  if (brief.games.length) {
    const hit = brief.games.filter((g) => games.includes(g));
    reqs.push({ requirement: "game", status: !games.length ? "unknown" : hit.length ? "met" : "unmet", detail: hit.join(",") || null });
  }
  if (brief.platforms.length) {
    const hit = brief.platforms.filter((p) => platforms.includes(p));
    reqs.push({ requirement: "platform", status: !platforms.length ? "unknown" : hit.length ? "met" : "unmet", detail: hit.join(",") || null });
  }
  if (brief.countries.length) {
    const share = geo.shares.filter((s) => brief.countries.includes(s.country)).reduce((a, s) => a + s.pct, 0);
    reqs.push({
      requirement: "geography",
      status: geo.provenance === "missing" ? "unknown" : share > 0 ? "met" : "unmet",
      detail: geo.provenance === "missing" ? null : Math.round(share * 10) / 10,
      provenance: geo.provenance,
    });
  }
  if (brief.formats.length) {
    const hit = brief.formats.filter((f) => formats.includes(f));
    reqs.push({ requirement: "format", status: !formats.length ? "unknown" : hit.length ? "met" : "unmet", detail: hit.join(",") || null });
  }
  if (brief.language) {
    const lang = row.content_language?.trim().toLowerCase();
    reqs.push({
      requirement: "language",
      status: !lang ? "unknown" : lang.includes(brief.language.toLowerCase()) ? "met" : "unmet",
      detail: row.content_language ?? null,
      provenance: lang ? "self_reported" : "missing",
    });
  }
  if (brief.minAvgViews !== null) {
    reqs.push({
      requirement: "reach",
      status: avgViews === null ? "unknown" : avgViews >= brief.minAvgViews ? "met" : "unmet",
      detail: avgViews,
      provenance: avgViews === null ? "missing" : "self_reported",
    });
  }
  if (brief.maxBudgetUsd !== null) {
    reqs.push({
      requirement: "budget",
      status: rate === null ? "unknown" : rate <= brief.maxBudgetUsd ? "met" : "unmet",
      detail: rate,
      // The creator's own starting rate, not a quote and not a price G derived.
      provenance: rate === null ? "missing" : "self_reported",
    });
  }

  return {
    creator_id: row.creator_id,
    full_name: row.full_name,
    met: reqs.filter((r) => r.status === "met").length,
    stated: reqs.length,
    requirements: reqs,
    metrics: [
      metric("avg_views", avgViews, "self_reported"),
      metric("avg_ccv", toNumber(row.avg_ccv), "self_reported"),
      metric("engagement_rate", toNumber(row.engagement_rate), "self_reported"),
      metric("base_rate_usd", rate, "self_reported"),
    ],
    geography: { provenance: geo.provenance, top: geo.shares.slice(0, 3) },
  };
}

/**
 * Rank directory rows against a brief. Order, in turn: more stated
 * requirements met; fewer unmet; verified geography before self-reported;
 * larger reported reach. Ties keep the directory's own order. Returns at
 * most `limit` creators who meet at least one stated requirement (or, when
 * the brief states none, the first `limit` with any reach data at all).
 */
export function recommendCreators(
  rows: readonly DirectoryRow[],
  brief: Brief,
  limit = 5,
  now: Date = new Date(),
): Recommendation[] {
  const evaluated = rows.map((r, i) => ({ i, rec: evaluateCreator(r, brief, now) }));
  const geoRank = (p: Provenance) => (p === "verified" ? 0 : p === "self_reported" ? 1 : 2);
  const unmet = (r: Recommendation) => r.requirements.filter((x) => x.status === "unmet").length;
  const views = (r: Recommendation) => (typeof r.metrics[0].value === "number" ? r.metrics[0].value : -1);
  const pool = evaluated.filter(({ rec }) => (rec.stated ? rec.met > 0 : views(rec) >= 0));
  pool.sort(
    (a, b) =>
      b.rec.met - a.rec.met ||
      unmet(a.rec) - unmet(b.rec) ||
      geoRank(a.rec.geography.provenance) - geoRank(b.rec.geography.provenance) ||
      views(b.rec) - views(a.rec) ||
      a.i - b.i,
  );
  return pool.slice(0, Math.max(1, Math.min(limit, 10))).map((x) => x.rec);
}

export type ComparisonRow = {
  criterion: string;
  values: { creator_id: string; value: string | number | null; provenance: Provenance; asOf?: string | null }[];
};

/**
 * Side-by-side comparison of up to 4 creators on the same criteria. Values
 * are shown as stored, each with its provenance; there is no combined score.
 * Ids that are not in the authorized directory are ignored.
 */
export function compareCreators(
  rows: readonly DirectoryRow[],
  ids: readonly string[],
  now: Date = new Date(),
): { creators: { creator_id: string; full_name: string }[]; rows: ComparisonRow[] } {
  const byId = new Map(rows.map((r) => [r.creator_id, r]));
  const picked = [...new Set(ids)].map((id) => byId.get(id)).filter((r): r is DirectoryRow => !!r).slice(0, 4);
  const cell = (row: DirectoryRow, value: string | number | null, provenance: Provenance, asOf?: string | null) => ({
    creator_id: row.creator_id,
    value,
    provenance: value === null ? ("missing" as Provenance) : provenance,
    asOf: asOf ?? null,
  });
  const out: ComparisonRow[] = [
    { criterion: "platforms", values: picked.map((r) => cell(r, (r.platforms ?? []).join(", ") || null, "self_reported")) },
    { criterion: "avg_views", values: picked.map((r) => cell(r, toNumber(r.avg_views), "self_reported")) },
    { criterion: "avg_ccv", values: picked.map((r) => cell(r, toNumber(r.avg_ccv), "self_reported")) },
    { criterion: "engagement_rate", values: picked.map((r) => cell(r, toNumber(r.engagement_rate), "self_reported")) },
    {
      criterion: "top_geography",
      values: picked.map((r) => {
        const g = geography(r, now);
        return cell(r, g.shares.slice(0, 3).map((s) => `${s.country} ${s.pct}%`).join(", ") || null, g.provenance, r.verified_geo_synced_at);
      }),
    },
    { criterion: "categories", values: picked.map((r) => cell(r, rowCategories(r).join(", ") || null, "self_reported")) },
    { criterion: "games", values: picked.map((r) => cell(r, knownGames(r.creator_games).join(", ") || null, "self_reported")) },
    { criterion: "language", values: picked.map((r) => cell(r, r.content_language ?? null, "self_reported")) },
    { criterion: "base_rate_usd", values: picked.map((r) => cell(r, toNumber(r.base_rate_usd), "self_reported")) },
  ];
  return { creators: picked.map((r) => ({ creator_id: r.creator_id, full_name: r.full_name })), rows: out };
}
