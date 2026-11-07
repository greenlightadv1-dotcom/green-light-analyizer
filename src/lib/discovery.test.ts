import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PAGE_SIZE, filterDirectory, parseDiscoveryQuery } from "./discovery.ts";
import type { DirectoryRow } from "./g/recommend.ts";

/** Creator Discovery: search, filters, explainable sorts, pagination and authorization. */

const NOW = new Date("2026-10-31T12:00:00Z");
const fresh = new Date(NOW.getTime() - 86_400_000).toISOString();
const stale = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();

const row = (i: number, over: Partial<DirectoryRow> = {}): DirectoryRow => ({
  creator_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  full_name: `Creator ${i}`,
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

const rows = [
  row(1, { full_name: "Nour Plays", avg_views: 5000, engagement_rate: 6, creator_games: ["valorant"], creator_categories: ["gaming"], platforms: ["twitch"], declared_top_countries: [{ country: "EG", pct: 60 }] }),
  row(2, { full_name: "Ahmed Tech", avg_views: 90000, engagement_rate: 2, content_category: "tech", platforms: ["youtube"], audience_verified: true, verified_top_countries: [{ country: "SA", pct: 40 }], verified_geo_synced_at: fresh }),
  row(3, { full_name: "Old Verified", avg_views: 20000, audience_verified: true, verified_top_countries: [{ country: "EG", pct: 70 }], verified_geo_synced_at: stale, declared_top_countries: [{ country: "AE", pct: 30 }] }),
];

test("query parsing keeps only known values", () => {
  const q = parseDiscoveryQuery({ q: " nour ", category: "gaming", game: "nope", platform: "myspace", country: "eg", minViews: "-1", sort: "secret", page: "x" });
  assert.deepEqual(
    [q.q, q.category, q.game, q.platform, q.country, q.minViews, q.sort, q.page],
    ["nour", "gaming", null, null, "EG", null, "reach", 1],
  );
});

test("search, category, game and platform filters", () => {
  const f = (p: Record<string, string>) => filterDirectory(rows, parseDiscoveryQuery(p), NOW).items.map((r) => r.full_name);
  assert.deepEqual(f({ q: "tech" }), ["Ahmed Tech"]);
  assert.deepEqual(f({ category: "tech" }), ["Ahmed Tech"]); // from the media kit category
  assert.deepEqual(f({ game: "valorant" }), ["Nour Plays"]);
  assert.deepEqual(f({ platform: "youtube" }), ["Ahmed Tech"]);
  assert.deepEqual(f({ minViews: "10000" }), ["Ahmed Tech", "Old Verified"]);
});

test("country filter uses fresh verified geography, otherwise declared, never stale verified", () => {
  const f = (country: string) => filterDirectory(rows, parseDiscoveryQuery({ country }), NOW).items.map((r) => r.full_name);
  assert.deepEqual(f("SA"), ["Ahmed Tech"]);
  // Old Verified's stale verified EG share is ignored; its declared AE share counts.
  assert.deepEqual(f("EG"), ["Nour Plays"]);
  assert.deepEqual(f("AE"), ["Old Verified"]);
});

test("verified-only excludes stale verification", () => {
  assert.deepEqual(filterDirectory(rows, parseDiscoveryQuery({ verified: "1" }), NOW).items.map((r) => r.full_name), ["Ahmed Tech"]);
});

test("each sort does what its label says", () => {
  const s = (sort: string) => filterDirectory(rows, parseDiscoveryQuery({ sort }), NOW).items.map((r) => r.full_name);
  assert.deepEqual(s("reach"), ["Ahmed Tech", "Old Verified", "Nour Plays"]);
  assert.deepEqual(s("engagement"), ["Nour Plays", "Ahmed Tech", "Old Verified"]);
  assert.deepEqual(s("verified"), ["Ahmed Tech", "Old Verified", "Nour Plays"]);
  assert.deepEqual(s("name"), ["Ahmed Tech", "Nour Plays", "Old Verified"]);
});

test("pagination is bounded", () => {
  const many = Array.from({ length: 30 }, (_, i) => row(i + 10));
  const p2 = filterDirectory(many, parseDiscoveryQuery({ page: "2" }), NOW);
  assert.deepEqual([p2.total, p2.pages, p2.page, p2.items.length], [30, 3, 2, PAGE_SIZE]);
  assert.equal(filterDirectory(many, parseDiscoveryQuery({ page: "99" }), NOW).page, 3);
});

test("Discovery is company/admin only and reads through the authorized RPC", () => {
  const page = readFileSync(new URL("../app/(app)/discover/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireRole\("company", "admin"\)/);
  const dir = readFileSync(new URL("./deals/directory.ts", import.meta.url), "utf8");
  assert.match(dir, /rpc\("creator_directory"\)/);
  assert.doesNotMatch(dir, /createAdminClient/);
  const sql = readFileSync(new URL("../../supabase/migrations/0024_marketplace_onboarding_taxonomy_uploads.sql", import.meta.url), "utf8");
  const fn = sql.slice(sql.indexOf("create function public.creator_directory()"), sql.indexOf("revoke all on function public.creator_directory()"));
  assert.doesNotMatch(fn, /primary_email|inbound_alias|whatsapp|bio/);
  assert.match(fn, /caller\.role in \('company', 'admin'\)/);
});
