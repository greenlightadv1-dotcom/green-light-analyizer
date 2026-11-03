import { strict as assert } from "node:assert";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { CONTENT_CATEGORIES, GAME_IDS, SEED_TAXONOMY, TAXONOMY_LIMITS, gameTitle, knownGames, parseClassification, termLabel, termsOf, type TaxonomySnapshot } from "./taxonomy.ts";
import { parseTermInput, taxonomyErrorMessage } from "./taxonomy-admin.ts";

/** Creator classification: controlled values, limits and stable order. */

test("valid selections are kept in the taxonomy's own order, duplicates collapsed", () => {
  const r = parseClassification({ categories: ["tech", "gaming", "gaming"], games: ["valorant"], formats: ["short_video", "live_stream"] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.creator_categories, ["gaming", "tech"]);
    assert.deepEqual(r.value.content_formats, ["live_stream", "short_video"]);
  }
});

test("unknown values are refused, not silently dropped", () => {
  assert.equal(parseClassification({ categories: ["hacking"], games: [], formats: [] }).ok, false);
  assert.equal(parseClassification({ categories: [], games: [42], formats: [] }).ok, false);
});

test("limits match migration 0024's CHECK constraints", () => {
  assert.deepEqual(TAXONOMY_LIMITS, { categories: 6, games: 12, formats: 8, tags: 20 });
  const tooMany = parseClassification({ categories: CONTENT_CATEGORIES.slice(0, 7), games: [], formats: [] });
  assert.equal(tooMany.ok, false);
  assert.equal(parseClassification({ categories: [], games: GAME_IDS.slice(0, 13), formats: [] }).ok, false);
});

test("stored data is read defensively", () => {
  assert.deepEqual(knownGames(["valorant", "removed_game"]), ["valorant"]);
  assert.deepEqual(knownGames(null), []);
  assert.equal(gameTitle("valorant"), "Valorant");
  assert.equal(gameTitle("unknown"), "unknown");
});

test("the code seed and the 0033 SQL seed hold exactly the same ids, kinds and parents", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0033_taxonomy.sql", import.meta.url), "utf8");
  const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '(category|genre|game|format)', (?:'([a-z0-9_]+)', )?'/g)].map((m) => `${m[1]}:${m[2]}:${m[3] ?? ""}`)
    // The kind CHECK list ('category', 'genre', 'game', …) is not a seed row.
    .filter((r) => !r.startsWith("category:genre:"));
  const seed = SEED_TAXONOMY.terms.map((t) => `${t.id}:${t.kind}:${t.parent_id ?? ""}`);
  assert.deepEqual([...rows].sort(), [...seed].sort());
  // Every id the 0024 columns could hold is in the seed, so no stored selection breaks.
  for (const id of [...CONTENT_CATEGORIES, ...GAME_IDS]) assert.ok(seed.some((x) => x.startsWith(`${id}:`)), id);
});

const withExtra = (patch: (s: TaxonomySnapshot) => void): TaxonomySnapshot => {
  const snap: TaxonomySnapshot = { source: "database", terms: SEED_TAXONOMY.terms.map((t) => ({ ...t })) };
  patch(snap);
  return snap;
};

test("terms an admin adds are accepted; deactivated ones only if already held", () => {
  const snap = withExtra((s) => {
    s.terms.push({ id: "sport_football", kind: "sport", parent_id: null, label_en: "Football", label_ar: "كرة القدم", description_en: null, description_ar: null, active: true, sort_order: 10 });
    s.terms.find((t) => t.id === "dota2")!.active = false;
  });
  const ok = parseClassification({ categories: ["gaming"], games: ["valorant"], formats: [], tags: ["sport_football"] }, snap);
  assert.ok(ok.ok && ok.value.creator_tags[0] === "sport_football");
  // A newly picked deactivated game is refused...
  assert.equal(parseClassification({ categories: ["gaming"], games: ["dota2"], formats: [] }, snap).ok, false);
  // ...but one the creator already had is kept.
  assert.equal(parseClassification({ categories: ["gaming"], games: ["dota2"], formats: [] }, snap, { creator_games: ["dota2"] }).ok, true);
  // Tags must be tag kinds, not games.
  assert.equal(parseClassification({ categories: ["gaming"], games: [], formats: [], tags: ["valorant"] }, snap).ok, false);
  assert.equal(termLabel(snap, "sport_football", "ar"), "كرة القدم");
  assert.equal(termLabel(snap, "sport_football", "fr"), "Football");
});

test("games are organised under genres; every seeded game has a parent", () => {
  const genres = termsOf(SEED_TAXONOMY, "genre");
  assert.ok(genres.length >= 5);
  for (const g of termsOf(SEED_TAXONOMY, "game")) assert.ok(g.parent_id, g.id);
});

test("admin term input is validated before it reaches the database", () => {
  const good = parseTermInput({ id: "sport_padel", kind: "sport", label_en: "Padel", label_ar: "بادل", sort_order: "20", active: "on" });
  assert.ok(good.ok && good.value.active && good.value.parent_id === null);
  for (const [f, field] of [
    [{ id: "Bad Id", kind: "sport", label_en: "x", label_ar: "x" }, "id"],
    [{ id: "ok_id", kind: "planet", label_en: "x", label_ar: "x" }, "kind"],
    [{ id: "ok_id", kind: "sport", label_en: "", label_ar: "x" }, "label_en"],
    [{ id: "ok_id", kind: "sport", label_en: "x", label_ar: "" }, "label_ar"],
    [{ id: "ok_id", kind: "sport", label_en: "x", label_ar: "x", parent_id: "ok_id" }, "parent_id"],
    [{ id: "ok_id", kind: "sport", label_en: "x", label_ar: "x", sort_order: "-1" }, "sort_order"],
  ] as const) {
    const r = parseTermInput(f as Record<string, unknown>);
    assert.ok(!r.ok && r.field === field, `${field}`);
  }
  assert.match(taxonomyErrorMessage("taxonomy:in_use"), /Deactivate it instead/);
  assert.match(taxonomyErrorMessage("whatever"), /could not be saved/);
});
