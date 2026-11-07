import { test } from "node:test";
import assert from "node:assert/strict";
import { cadence, topContent, type SyncedVideo } from "./content-analytics.ts";

const now = new Date("2026-11-03T12:00:00Z");
const v = (id: string, daysAgo: number | null, views: number | null, likes: number | null = 10, comments: number | null = 2): SyncedVideo => ({
  video_id: id, title: id, published_at: daysAgo === null ? null : new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  view_count: views, like_count: likes, comment_count: comments,
});

test("top content is ranked by views; hidden likes give no engagement figure, never 0%", () => {
  const top = topContent([v("a", 1, 100), v("b", 2, 5000, null, 3), v("c", 3, null), v("d", 4, 900)], 3);
  assert.deepEqual(top.map((x) => x.video_id), ["b", "d", "a"]);
  assert.equal(top[0].engagement_pct, null, "likes hidden: unknown, not zero");
  assert.equal(top[2].engagement_pct, 12, "(10 + 2) / 100");
  assert.ok(!top.some((x) => x.video_id === "c"), "a video with no view count is not ranked");
});

test("cadence is reported only over windows the sample covers", () => {
  // 50 uploads every 2 days: the sample reaches back ~98 days, so both windows are known.
  const regular = Array.from({ length: 50 }, (_, i) => v(`r${i}`, i * 2, 100));
  const c = cadence(regular, now, false);
  assert.equal(c.last30, 16);
  assert.equal(c.last90, 46);
  assert.equal(c.medianGapDays, 2);
  assert.equal(c.consistency, "regular");
  assert.equal(c.perWeek, 3.5);
  // 50 uploads all in the last 20 days, more exist: 30- and 90-day counts are unknown.
  const busy = Array.from({ length: 50 }, (_, i) => v(`b${i}`, i * 0.4, 100));
  const cb = cadence(busy, now, false);
  assert.equal(cb.last30, null);
  assert.equal(cb.last90, null);
  // The same uploads as the whole history: the counts are known.
  assert.equal(cadence(busy, now, true).last30, 50);
});

test("too little data is unknown, not zero", () => {
  const two = cadence([v("x", 1, 1), v("y", 9, 1)], now, false);
  assert.equal(two.medianGapDays, null);
  assert.equal(two.consistency, null);
  assert.equal(two.perWeek, null);
  const none = cadence([], now, true);
  assert.equal(none.sample, 0);
  assert.equal(none.daysSinceLast, null);
  // A channel with no uploads at all (complete, empty) has known zero uploads.
  assert.equal(none.last30, 0);
  // Undated or future uploads are ignored.
  assert.equal(cadence([v("u", null, 1), v("f", -5, 1)], now, false).sample, 0);
});

test("irregular schedules are recognised", () => {
  const gaps = [0, 1, 2, 30, 31, 32, 80, 81];
  const c = cadence(gaps.map((d, i) => v(`g${i}`, d, 1)), now, true);
  assert.equal(c.consistency, "irregular");
});
