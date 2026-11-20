import { strict as assert } from "node:assert";
import { test } from "node:test";
import { briefFromText, mergeBrief } from "./brief-text.ts";
import { EMPTY_BRIEF } from "./recommend.ts";

test("English search criteria become a structured brief", () => {
  const { brief, understood } = briefFromText("I need Egyptian gaming creators who stream Valorant on Twitch, budget $2,000");
  assert.deepEqual(brief.categories, ["gaming"]);
  assert.deepEqual(brief.games, ["valorant"]);
  assert.deepEqual(brief.platforms, ["twitch"]);
  assert.deepEqual(brief.countries, ["EG"]);
  assert.ok(brief.formats?.includes("live_stream"));
  assert.equal(brief.maxBudgetUsd, 2000);
  assert.ok(understood.includes("budget"));
});

test("Arabic search criteria are understood too", () => {
  const { brief } = briefFromText("عايز صناع محتوى سعوديين في اللياقة على يوتيوب، ميزانية ٥ ألف");
  assert.deepEqual(brief.categories, ["fitness"]);
  assert.deepEqual(brief.countries, ["SA"]);
  assert.deepEqual(brief.platforms, ["youtube"]);
  assert.equal(brief.maxBudgetUsd, 5000);
});

test("a named game implies gaming; views thresholds are read", () => {
  const { brief } = briefFromText("PUBG creators with at least 50k views");
  assert.deepEqual(brief.categories, ["gaming"]);
  assert.deepEqual(brief.games, ["pubg"]);
  assert.equal(brief.minAvgViews, 50_000);
});

test("nothing is guessed from text it does not recognise", () => {
  const { brief, understood } = briefFromText("find me someone good for our launch");
  assert.deepEqual(brief, {});
  assert.deepEqual(understood, []);
});

test("the structured brief always wins over words in the message", () => {
  const merged = mergeBrief({ ...EMPTY_BRIEF, countries: ["AE"] }, { countries: ["EG"], games: ["valorant"] });
  assert.deepEqual(merged.countries, ["AE"]);
  assert.deepEqual(merged.games, ["valorant"]);
});
