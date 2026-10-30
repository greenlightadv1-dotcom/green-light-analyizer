import type { AiEvaluation } from "@/lib/types/database";
import { overlapWith } from "../media-kit/countries.ts";
import type { EvaluationInput, EvaluationResult } from "./types";
import { capRiskByVerification, highValueBasisUsd } from "./rules.ts";

/**
 * The rule-based engine (§5.4 fallback), moved out of evaluate.ts so it is
 * pure and unit-tested directly (heuristic.test.ts). evaluate.ts still owns
 * when it runs.
 */

// --- Heuristic fallback ----------------------------------------------------

/**
 * Rough USD CPM by category. Placeholders until the client supplies real
 * benchmark data — §7.1 calls for content_category to "drive benchmark
 * pricing" but does not say from what table.
 */
export const CATEGORY_CPM: Record<string, number> = {
  finance: 35,
  tech: 25,
  business: 25,
  beauty: 18,
  gaming: 12,
  entertainment: 10,
  lifestyle: 14,
};
export const DEFAULT_CPM = 15;

/** Relative worth of each deliverable (§6.2 sponsorship_type). */
export const TYPE_MULTIPLIER: Record<string, number> = {
  video_dedicated: 1,
  integration: 0.45,
  post: 0.3,
  story_share: 0.15,
  live_mention: 0.2,
  other: 0.35,
};

/**
 * Deterministic pricing used when every configured provider is unreachable,
 * or when none is configured at all.
 *
 * This is NOT the AI Co-Pilot and must never be presented as it — the result
 * carries engine: "heuristic" so the UI can say so. It exists so the whole
 * flow is testable and the product is usable before the key lands.
 */
export function heuristicEvaluate(input: EvaluationInput): EvaluationResult {
  const views = input.avg_views ?? 0;
  const cpm = CATEGORY_CPM[input.content_category?.toLowerCase() ?? ""] ?? DEFAULT_CPM;
  const typeMult = TYPE_MULTIPLIER[input.sponsorship_type] ?? 0.35;

  const geoSource = input.audience_verified
    ? input.verified_top_countries
    : input.declared_top_countries;
  const overlap = overlapWith(geoSource, input.target_countries);

  // Engagement above ~4% is healthy; below ~1% suggests inflated followers (§7.1).
  const engagement = input.engagement_rate ?? 3;
  const engagementMult = Math.min(Math.max(engagement / 4, 0.6), 1.6);

  // Audience outside the target countries is worth less to this sponsor, but
  // never zero — the creator still delivers the impressions.
  const geoMult = overlap === null ? 0.85 : 0.4 + 0.6 * overlap;

  const base = (views / 1000) * cpm * typeMult * engagementMult * geoMult;
  const mid = Math.max(Math.round(base / 10) * 10, 25);

  let risk: AiEvaluation = "yellow";
  const reasons: string[] = [];

  if (overlap !== null && overlap >= 0.5 && engagement >= 2) {
    risk = "green";
    reasons.push(
      `${Math.round(overlap * 100)}% of the audience sits in the countries this sponsor is targeting`,
    );
  } else if (overlap !== null && overlap < 0.2) {
    risk = "red";
    reasons.push(
      `only ${Math.round(overlap * 100)}% of the audience is in the sponsor's target countries`,
    );
  }
  if (engagement < 1) {
    risk = "red";
    reasons.push(`engagement of ${engagement}% is low enough to suggest inflated reach`);
  }
  // Missing reach is a gap in *our* data, not a fact about the offer, so it
  // never makes an offer red by itself (D6). It does hold the rating below
  // green: the price above has nothing to stand on.
  if (!views) {
    if (risk === "green") risk = "yellow";
    reasons.push("no reach figures are on file for this creator yet, so the price is a floor estimate");
  }

  const capped = capRiskByVerification(
    risk,
    input.audience_verified,
    highValueBasisUsd(mid, input.offered_amount_usd),
  );

  return {
    recommended_price_usd: mid,
    price_range_usd: {
      low: Math.round((mid * 0.8) / 5) * 5,
      high: Math.round((mid * 1.35) / 5) * 5,
    },
    risk: capped.risk,
    risk_capped: capped.risk_capped,
    reasoning: reasons.length
      ? `Rule-based estimate: ${reasons.join("; ")}.`
      : "Rule-based estimate from reach, category benchmark and deliverable type.",
    geo_basis: input.audience_verified
      ? "verified"
      : geoSource?.length
        ? "declared"
        : "none",
    engine: "heuristic",
  };
}

// --- Entry point -----------------------------------------------------------
