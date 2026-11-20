import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  EMPTY_BRIEF,
  compareCreators,
  evaluateCreator,
  missingBriefFields,
  parseBrief,
  recommendCreators,
  type DirectoryRow,
} from "./recommend.ts";

/** G company recommendations and comparisons: relevance, explanations, missing data, no fabrication. */

const NOW = new Date("2026-10-31T12:00:00Z");
const fresh = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();

const row = (over: Partial<DirectoryRow>): DirectoryRow => ({
  creator_id: "00000000-0000-4000-8000-000000000001",
  full_name: "A",
  content_category: null,
  content_language: null,
  avg_views: null,
  avg_ccv: null,
  engagement_rate: null,
  declared_top_countries: null,
  verified_top_countries: null,
  audience_verified: false,
  platforms: null,
  ...over,
});

const valorantEg = row({
  creator_id: "00000000-0000-4000-8000-00000000000a",
  full_name: "Valorant EG",
  creator_categories: ["gaming"],
  creator_games: ["valorant"],
  platforms: ["youtube", "twitch"],
  content_language: "Arabic",
  avg_views: 20000,
  engagement_rate: "4.5",
  verified_top_countries: [{ country: "EG", pct: 60 }],
  audience_verified: true,
  verified_geo_synced_at: fresh,
  base_rate_usd: 900,
});
const fifaSa = row({
  creator_id: "00000000-0000-4000-8000-00000000000b",
  full_name: "FC SA",
  creator_categories: ["gaming"],
  creator_games: ["ea_fc"],
  platforms: ["kick"],
  avg_views: 50000,
  declared_top_countries: [{ country: "SA", pct: 70 }],
  base_rate_usd: 3000,
});
const unknownData = row({ creator_id: "00000000-0000-4000-8000-00000000000c", full_name: "No data" });

test("parseBrief keeps only known values and valid country codes", () => {
  const b = parseBrief({
    categories: ["gaming", "made-up"],
    games: ["valorant", "x"],
    platforms: ["youtube", "myspace"],
    countries: ["eg", "SAU", "sa", "eg"],
    maxBudgetUsd: "1500",
    minAvgViews: -5,
    objective: "  Launch  ",
  });
  assert.deepEqual(b.categories, ["gaming"]);
  assert.deepEqual(b.games, ["valorant"]);
  assert.deepEqual(b.platforms, ["youtube"]);
  assert.deepEqual(b.countries, ["EG", "SA"]);
  assert.equal(b.maxBudgetUsd, 1500);
  assert.equal(b.minAvgViews, null);
  assert.equal(b.objective, "Launch");
});

test("missingBriefFields names what the brief does not state", () => {
  assert.deepEqual(missingBriefFields(EMPTY_BRIEF), ["objective", "category_or_game", "countries", "platforms", "budget", "timeline"]);
  assert.deepEqual(missingBriefFields(parseBrief({ objective: "x", games: ["valorant"], countries: ["EG"], platforms: ["youtube"], maxBudgetUsd: 1, timeline: "Q1" })), []);
});

test("recommendations rank by requirements met and explain each one", () => {
  const brief = parseBrief({ games: ["valorant"], countries: ["EG"], platforms: ["youtube"], maxBudgetUsd: 1000 });
  const recs = recommendCreators([fifaSa, valorantEg, unknownData], brief, 5, NOW);
  assert.equal(recs[0].creator_id, valorantEg.creator_id);
  assert.equal(recs[0].met, 4);
  assert.equal(recs[0].stated, 4);
  const geo = recs[0].requirements.find((r) => r.requirement === "geography")!;
  assert.deepEqual([geo.status, geo.detail, geo.provenance], ["met", 60, "verified"]);
  const budget = recs[0].requirements.find((r) => r.requirement === "budget")!;
  assert.equal(budget.provenance, "self_reported");
  // A creator with no data meets nothing, so is not recommended.
  assert.ok(!recs.some((r) => r.creator_id === unknownData.creator_id));
});

test("unmet and unknown requirements are reported, not hidden", () => {
  const brief = parseBrief({ games: ["valorant"], countries: ["EG"], maxBudgetUsd: 1000 });
  const r = evaluateCreator(fifaSa, brief, NOW);
  const status = Object.fromEntries(r.requirements.map((x) => [x.requirement, x.status]));
  assert.deepEqual(status, { game: "unmet", geography: "unmet", budget: "unmet" });
  const u = evaluateCreator(unknownData, brief, NOW);
  assert.ok(u.requirements.every((x) => x.status === "unknown"));
  assert.ok(u.metrics.every((m) => m.provenance === "missing" && m.value === null));
});

test("stale verified geography is not used as verified", () => {
  const stale = { ...valorantEg, verified_geo_synced_at: "2026-08-01T00:00:00Z" };
  const r = evaluateCreator(stale, parseBrief({ countries: ["EG"] }), NOW);
  assert.equal(r.geography.provenance, "missing");
  assert.equal(r.requirements[0].status, "unknown");
});

test("self-reported geography is labelled self-reported", () => {
  const r = evaluateCreator(fifaSa, parseBrief({ countries: ["SA"] }), NOW);
  assert.deepEqual([r.requirements[0].status, r.requirements[0].provenance], ["met", "self_reported"]);
});

test("comparison uses the same criteria for each creator, ignores unknown ids, and has no combined score", () => {
  const c = compareCreators([valorantEg, fifaSa], [valorantEg.creator_id, "00000000-0000-4000-8000-0000000000ff", fifaSa.creator_id], NOW);
  assert.deepEqual(c.creators.map((x) => x.creator_id), [valorantEg.creator_id, fifaSa.creator_id]);
  for (const r of c.rows) assert.equal(r.values.length, 2);
  assert.ok(!c.rows.some((r) => /score|rank/.test(r.criterion)));
  const geo = c.rows.find((r) => r.criterion === "top_geography")!;
  assert.deepEqual(geo.values.map((v) => v.provenance), ["verified", "self_reported"]);
  const ccv = c.rows.find((r) => r.criterion === "avg_ccv")!;
  assert.ok(ccv.values.every((v) => v.provenance === "missing"));
});

test("comparison caps at four creators", () => {
  const rows = Array.from({ length: 6 }, (_, i) => row({ creator_id: `00000000-0000-4000-8000-00000000010${i}`, full_name: `C${i}` }));
  assert.equal(compareCreators(rows, rows.map((r) => r.creator_id), NOW).creators.length, 4);
});
