import "server-only";

import type { AiEvaluation } from "@/lib/types/database";
import type { EvaluationInput, EvaluationResult } from "./types";
import { evaluateWithGemini } from "./gemini";
import { capRiskByVerification } from "./rules";
import { overlapWith } from "@/lib/media-kit/countries";

export { capRiskByVerification, HIGH_VALUE_DEAL_USD } from "./rules";

/**
 * Deal evaluation — CLAUDE.md §5.4, §7.4.
 *
 * One entry point, shared by the Manual Analyzer (§5.1) and, when it is built,
 * the inbound-email webhook (§5.4), so the two can never drift apart on price.
 */

// --- Heuristic fallback ----------------------------------------------------

/**
 * Rough USD CPM by category. Placeholders until the client supplies real
 * benchmark data — §7.1 calls for content_category to "drive benchmark
 * pricing" but does not say from what table.
 */
const CATEGORY_CPM: Record<string, number> = {
  finance: 35,
  tech: 25,
  business: 25,
  beauty: 18,
  gaming: 12,
  entertainment: 10,
  lifestyle: 14,
};
const DEFAULT_CPM = 15;

/** Relative worth of each deliverable (§6.2 sponsorship_type). */
const TYPE_MULTIPLIER: Record<string, number> = {
  video_dedicated: 1,
  integration: 0.45,
  post: 0.3,
  story_share: 0.15,
  live_mention: 0.2,
  other: 0.35,
};

/**
 * Deterministic pricing used when GEMINI_API_KEY is absent.
 *
 * This is NOT the AI Co-Pilot and must never be presented as it — the result
 * carries engine: "heuristic" so the UI can say so. It exists so the whole
 * flow is testable and the product is usable before the key lands.
 */
function heuristicEvaluate(input: EvaluationInput): EvaluationResult {
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
  if (!views) {
    risk = "red";
    reasons.push("no reach figures are on file for this creator yet");
  }

  const capped = capRiskByVerification(risk, input.audience_verified, mid);

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

/**
 * Price and risk-rate an offer.
 *
 * Gemini when a key is configured (§9 — deliberately Gemini, not Claude, for
 * cost on this high-volume path), otherwise the deterministic fallback above.
 * Either way the §7.4 verification cap is applied to the result, so the rule
 * holds regardless of which engine answered.
 */
export async function evaluateOffer(
  input: EvaluationInput,
): Promise<EvaluationResult> {
  if (!process.env.GEMINI_API_KEY) {
    return heuristicEvaluate(input);
  }

  try {
    const raw = await evaluateWithGemini(input);
    const capped = capRiskByVerification(
      raw.risk,
      input.audience_verified,
      raw.recommended_price_usd,
    );

    return {
      ...raw,
      risk: capped.risk,
      risk_capped: capped.risk_capped,
      geo_basis: input.audience_verified
        ? "verified"
        : input.declared_top_countries?.length
          ? "declared"
          : "none",
      engine: "gemini",
    };
  } catch {
    // A creator waiting on an offer is better served by a rule-based number
    // than by an error. The engine field tells the UI which one they got.
    return heuristicEvaluate(input);
  }
}
