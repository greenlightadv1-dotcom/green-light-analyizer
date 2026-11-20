import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGrowth, cutoffDay, SNAPSHOT_MAX_AGE_DAYS, type Snapshot } from "./growth.ts";

const NOW = new Date("2026-11-02T12:00:00Z");
const snap = (day: string, subs: number | null, views: number | null = null): Snapshot => ({
  captured_on: day,
  subscriber_count: subs,
  channel_view_count: views,
  media_count: null,
});

test("no growth from zero or one snapshot", () => {
  assert.equal(computeGrowth([], "subscriber_count", NOW), null);
  assert.equal(computeGrowth([snap("2026-11-02", 1000)], "subscriber_count", NOW), null);
});

test("growth is the change between the oldest and newest real snapshot", () => {
  const g = computeGrowth(
    [snap("2026-11-02", 1100), snap("2026-10-26", 1000), snap("2026-10-30", 1050)],
    "subscriber_count",
    NOW,
  );
  assert.deepEqual(g, {
    metric: "subscriber_count", from: 1000, to: 1100, fromDate: "2026-10-26", toDate: "2026-11-02", days: 7, change: 100, pct: 10,
  });
});

test("declines are reported as negative, not hidden", () => {
  const g = computeGrowth([snap("2026-10-20", 500), snap("2026-11-01", 450)], "subscriber_count", NOW);
  assert.equal(g?.change, -50);
  assert.equal(g?.pct, -10);
});

test("snapshots outside the 29-day window, in the future or invalid are ignored", () => {
  assert.equal(SNAPSHOT_MAX_AGE_DAYS, 29);
  assert.equal(cutoffDay(NOW), "2026-10-04");
  const g = computeGrowth(
    [snap("2026-09-01", 10), snap("2026-11-01", 200), snap("2026-11-09", 999), snap("not-a-day", 1)],
    "subscriber_count",
    NOW,
  );
  assert.equal(g, null, "only one valid in-window point remains");
});

test("a missing metric on either end means no growth for that metric", () => {
  const s = [snap("2026-10-20", 500, null), snap("2026-11-01", 600, 9000)];
  assert.equal(computeGrowth(s, "channel_view_count", NOW), null);
  assert.equal(computeGrowth(s, "subscriber_count", NOW)?.change, 100);
});

test("a zero starting value gives a change but no percentage", () => {
  const g = computeGrowth([snap("2026-10-20", 0), snap("2026-11-01", 25)], "subscriber_count", NOW);
  assert.equal(g?.change, 25);
  assert.equal(g?.pct, null);
});
