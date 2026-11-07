import { strict as assert } from "node:assert";
import { test } from "node:test";

import { assessCreator, type CreatorProfileInput, type KitInput } from "./assessment.ts";

/** G creator channel assessment: accuracy against stored data, provenance, freshness, no invention. */

const NOW = new Date("2026-10-31T12:00:00Z");
const DAYS = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const profile: CreatorProfileInput = {
  full_name: "Test Creator",
  bio: "Gaming streams",
  avatar_url: null,
  country: "EG",
  primary_language: "Arabic",
  base_rate_usd: null,
  social_links: { youtube: "@test" },
  shareable_slug: "test",
  inbound_alias: "test.ab12@analyze.greenlightadvs.com",
  creator_categories: ["gaming"],
};

const youtube: KitInput = {
  platform: "youtube",
  avg_views: 12000,
  avg_ccv: null,
  engagement_rate: 5.2,
  content_category: "gaming",
  content_language: "Arabic",
  declared_top_countries: [{ country: "EG", pct: 50 }],
  verified_top_countries: [{ country: "EG", pct: 41 }, { country: "SA", pct: 19 }],
  audience_verified: true,
  verified_geo_synced_at: DAYS(3),
  subscriber_count: 212000,
  channel_view_count: 18400000,
  media_count: 340,
  youtube_stats_synced_at: DAYS(3),
};

const twitch: KitInput = {
  platform: "twitch",
  avg_views: 800,
  avg_ccv: 300,
  engagement_rate: 0.6,
  content_category: "gaming",
  content_language: "Arabic",
  declared_top_countries: [{ country: "SA", pct: 45 }],
  verified_top_countries: null,
  audience_verified: false,
};

test("metrics are reported exactly as stored, with provenance", () => {
  const a = assessCreator(profile, [youtube], [], NOW);
  const yt = a.platforms[0];
  const get = (k: string) => yt.metrics.find((m) => m.key === k)!;
  assert.deepEqual([get("avg_views").value, get("avg_views").provenance], [12000, "self_reported"]);
  assert.deepEqual([get("subscribers").value, get("subscribers").provenance], [212000, "synced"]);
  assert.equal(get("avg_ccv").provenance, "missing");
  assert.equal(yt.geography.provenance, "verified");
  assert.deepEqual(yt.geography.shares[0], { country: "EG", pct: 41 });
});

test("verified geography older than 30 days is stale, never verified, and its shares are not shown", () => {
  const a = assessCreator(profile, [{ ...youtube, verified_geo_synced_at: DAYS(31) }], [], NOW);
  assert.equal(a.platforms[0].geography.provenance, "stale");
  assert.deepEqual(a.platforms[0].geography.shares, []);
  assert.ok(a.improvements.some((f) => f.code === "geography_stale"));
  assert.ok(!a.strengths.some((f) => f.code === "verified_geography"));
});

test("synced stats older than 30 days are stale", () => {
  const a = assessCreator(profile, [{ ...youtube, youtube_stats_synced_at: DAYS(40) }], [], NOW);
  assert.equal(a.platforms[0].metrics.find((m) => m.key === "subscribers")!.provenance, "stale");
  assert.ok(a.improvements.some((f) => f.code === "stats_stale"));
});

test("audience_verified without verified data is not called verified", () => {
  const a = assessCreator(profile, [{ ...youtube, verified_top_countries: null }], [], NOW);
  assert.equal(a.platforms[0].geography.provenance, "self_reported");
});

test("only Green Light's stated engagement defaults are used, with their thresholds", () => {
  const a = assessCreator(profile, [youtube, twitch], [], NOW);
  const healthy = a.strengths.find((f) => f.code === "engagement_healthy");
  const low = a.improvements.find((f) => f.code === "engagement_low");
  assert.deepEqual(healthy?.params, { pct: 5.2, threshold: 4 });
  assert.deepEqual(low?.params, { pct: 0.6, threshold: 1 });
  assert.equal(low?.platform, "twitch");
});

test("manual-only platforms are flagged, and self-reported YouTube geography suggests connecting analytics", () => {
  const a = assessCreator(profile, [{ ...youtube, audience_verified: false, verified_top_countries: null }, twitch], [], NOW);
  assert.ok(a.improvements.some((f) => f.code === "manual_only" && f.platform === "twitch"));
  assert.ok(a.improvements.some((f) => f.code === "connect_analytics" && f.platform === "youtube"));
  assert.ok(!a.improvements.some((f) => f.code === "connect_analytics" && f.platform === "twitch"));
});

test("missing data is reported as missing, never filled in", () => {
  const empty: CreatorProfileInput = { ...profile, bio: null, country: null, creator_categories: [], inbound_alias: null };
  const a = assessCreator(empty, [], [], NOW);
  const codes = a.missing.map((f) => f.code);
  for (const c of ["no_platforms", "no_categories", "no_alias", "profile_bio", "profile_country"]) assert.ok(codes.includes(c), c);
  assert.equal(a.mediaKit.done, 0);
  assert.ok(a.nextActions.includes("open_onboarding"));
  assert.ok(a.nextActions.includes("open_media_kit"));
  assert.equal(a.platforms.length, 0);
});

test("deal summary counts statuses and open deals", () => {
  const deals = [
    { id: "1", deal_status: "new", sponsorship_type: null, offered_amount: null, recommended_price_usd: null, ai_evaluation: null, created_at: null },
    { id: "2", deal_status: "negotiating", sponsorship_type: null, offered_amount: 500, recommended_price_usd: 650, ai_evaluation: "yellow", created_at: null },
    { id: "3", deal_status: "paid", sponsorship_type: null, offered_amount: 800, recommended_price_usd: 800, ai_evaluation: "green", created_at: null },
  ] as const;
  const a = assessCreator(profile, [youtube], [...deals], NOW);
  assert.equal(a.deals.total, 3);
  assert.equal(a.deals.open, 2);
  assert.equal(a.deals.byStatus.paid, 1);
  assert.ok(a.nextActions.includes("open_inbox"));
});
