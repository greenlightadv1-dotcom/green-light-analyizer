import { strict as assert } from "node:assert";
import { test } from "node:test";

import { CONTENT_CATEGORIES, GAME_IDS, TAXONOMY_LIMITS, gameTitle, knownGames, parseClassification } from "./taxonomy.ts";

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
  assert.deepEqual(TAXONOMY_LIMITS, { categories: 6, games: 12, formats: 8 });
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
