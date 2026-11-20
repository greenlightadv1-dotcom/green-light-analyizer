import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RETENTION_DAYS, isPurgeable, retentionCutoff } from "./retention.ts";

test("the approved period is 365 days, in the code and in the database alike", () => {
  assert.equal(RETENTION_DAYS, 365);
  const sql = readFileSync(new URL("../../../supabase/migrations/0040_review_notes_flags_retention.sql", import.meta.url), "utf8");
  const due = sql.slice(sql.indexOf("create or replace function private.verification_purge_due"));
  assert.match(due, /c\.reviewed_at <= now\(\) - interval '365 days'/);
  assert.match(due, /c\.updated_at <= now\(\) - interval '365 days'/);
  assert.match(sql, /raise exception 'retention:not_due'/);
  // No environment variable can shorten it any more.
  assert.doesNotMatch(readFileSync(new URL("./retention.ts", import.meta.url), "utf8"), /process\.env/);
});

test("cases awaiting review are never purged; decided and abandoned ones only after 365 days", () => {
  const now = new Date("2027-11-20T00:00:00Z");
  const cutoff = retentionCutoff(RETENTION_DAYS, now);
  assert.equal(cutoff, "2026-11-20T00:00:00.000Z");
  const old = "2026-11-19T00:00:00Z";
  const tooRecent = "2026-11-21T00:00:00Z";
  for (const status of ["submitted", "under_review", "needs_info"]) assert.equal(isPurgeable({ status, reviewed_at: old, updated_at: old }, cutoff), false);
  assert.equal(isPurgeable({ status: "approved", reviewed_at: old, updated_at: old }, cutoff), true);
  assert.equal(isPurgeable({ status: "rejected", reviewed_at: tooRecent, updated_at: old }, cutoff), false);
  assert.equal(isPurgeable({ status: "draft", reviewed_at: null, updated_at: old }, cutoff), true);
  assert.equal(isPurgeable({ status: "approved", reviewed_at: null, updated_at: old }, cutoff), false);
});

test("the purge is scheduled daily and only runs with the cron secret", () => {
  const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
  assert.ok(vercel.crons.some((c: { path: string; schedule: string }) => c.path === "/api/cron/verification-retention" && /^\d+ \d+ \* \* \*$/.test(c.schedule)));
  const route = readFileSync(new URL("../../app/api/cron/verification-retention/route.ts", import.meta.url), "utf8");
  assert.match(route, /isAuthorizedCron\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
  // It deletes only the file name the database returned when it marked the row.
  assert.match(route, /rpc\("verification_purge_mark"/);
  assert.doesNotMatch(route, /update\(\{ removed_at/);
  // Decided cases are found by their decision date, not by their last update.
  assert.match(route, /status\.in\.\(approved,rejected\),reviewed_at\.lte\./);
  assert.doesNotMatch(route, /\.lte\("updated_at"/);
});
