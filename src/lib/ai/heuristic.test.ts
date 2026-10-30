import { strict as assert } from "node:assert";
import { test } from "node:test";

import { heuristicEvaluate } from "./heuristic.ts";
import type { EvaluationInput } from "./types.ts";

/** D6: the rule-based engine never rates an offer red just because our data is missing. */

const base: EvaluationInput = {
  avg_views: 50_000,
  avg_ccv: null,
  engagement_rate: 4,
  content_category: "tech",
  content_language: "ar",
  declared_top_countries: [{ country: "EG", pct: 60 }, { country: "SA", pct: 20 }],
  verified_top_countries: null,
  audience_verified: false,
  sponsorship_type: "integration",
  target_countries: ["EG"],
  offer_text: "We'd like an integration.",
};

test("no reach on file is yellow, not red, and says why", () => {
  const r = heuristicEvaluate({ ...base, avg_views: null });
  assert.equal(r.risk, "yellow");
  assert.match(r.reasoning, /no reach figures/);
});

test("no analytics at all — no reach, engagement, geography or targets — is yellow", () => {
  const r = heuristicEvaluate({
    ...base,
    avg_views: null,
    engagement_rate: null,
    content_category: null,
    declared_top_countries: null,
    target_countries: null,
  });
  assert.equal(r.risk, "yellow");
  assert.equal(r.geo_basis, "none");
});

test("missing reach also holds an otherwise-green offer below green", () => {
  // 100% of a (declared) audience in the target country would be green with reach.
  const withReach = heuristicEvaluate({ ...base, declared_top_countries: [{ country: "EG", pct: 100 }] });
  assert.equal(withReach.risk, "green");
  const noReach = heuristicEvaluate({ ...base, avg_views: 0, declared_top_countries: [{ country: "EG", pct: 100 }] });
  assert.equal(noReach.risk, "yellow");
});

test("real evidence still produces red when reach is missing", () => {
  // Measured low engagement and a target market the audience is not in are
  // facts about this deal, not gaps in our data.
  assert.equal(heuristicEvaluate({ ...base, avg_views: null, engagement_rate: 0.5 }).risk, "red");
  assert.equal(heuristicEvaluate({ ...base, avg_views: null, target_countries: ["US"] }).risk, "red");
});

test("with reach on file the existing rules are unchanged", () => {
  assert.equal(heuristicEvaluate({ ...base, target_countries: ["US"] }).risk, "red");
  assert.equal(heuristicEvaluate({ ...base, engagement_rate: 0.5 }).risk, "red");
  assert.equal(heuristicEvaluate(base).engine, "heuristic");
});
