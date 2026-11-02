/**
 * Source guards for growth snapshots (migration 0025): written only by the
 * server after a successful API sync, never from self-reported input, and
 * pruned at 29 days on both the sync path and the daily job.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the YouTube sync writes a snapshot only after the stats update succeeded", () => {
  const src = read("lib/media-kit/actions.ts");
  const start = src.indexOf("export async function syncYoutubeStats(");
  const body = src.slice(start, src.indexOf("\nexport ", start + 1));
  const failAt = body.indexOf('"actionErrors.youtubeStatsNotSaved"');
  const writeAt = body.indexOf('.from("media_kit_snapshots").upsert(');
  const pruneAt = body.indexOf('.lt("captured_on", cutoffDay(');
  assert.ok(failAt > 0 && writeAt > failAt && pruneAt > writeAt, "order: save stats, then snapshot, then prune");
  assert.match(body, /source: "youtube_data_api"/);
  assert.match(body, /onConflict: "media_kit_id,captured_on"/);
});

test("no other server action writes snapshots (self-reported values never become history)", () => {
  for (const f of ["lib/media-kit/actions.ts", "app/(app)/settings/actions.ts", "app/(app)/onboarding/actions.ts"]) {
    const n = (read(f).match(/from\("media_kit_snapshots"\)\.upsert|from\("media_kit_snapshots"\)\.insert/g) ?? []).length;
    assert.equal(n, f === "lib/media-kit/actions.ts" ? 1 : 0, f);
  }
});

test("the daily freshness job prunes snapshots older than 29 days", () => {
  const src = read("app/api/cron/youtube-data-freshness/route.ts");
  assert.match(src, /from\("media_kit_snapshots"\)\s*\.delete\(\)\s*\.lt\("captured_on", cutoffDay\(new Date\(\)\)\)/);
});

test("the Media Kit reads snapshots with the caller's client (RLS), not the service role", () => {
  const src = read("lib/media-kit/queries.ts");
  const start = src.indexOf("export async function listSnapshots(");
  const body = src.slice(start);
  assert.match(body, /await createClient\(\)/);
  assert.doesNotMatch(body, /createAdminClient/);
});
