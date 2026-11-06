import { test } from "node:test";
import assert from "node:assert/strict";
import { isPurgeable, retentionConfig, retentionCutoff } from "./retention.ts";

test("no retention period is assumed: purging is off unless explicitly configured", () => {
  assert.deepEqual(retentionConfig({}), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "" }), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "0" }), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "3" }), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "abc" }), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "99999" }), { enabled: false });
  assert.deepEqual(retentionConfig({ VERIFICATION_RETENTION_DAYS: "365" }), { enabled: true, days: 365 });
});

test("cases awaiting review are never purged; decided and abandoned ones after the cutoff", () => {
  const cutoff = retentionCutoff(30, new Date("2026-11-02T00:00:00Z"));
  assert.equal(cutoff, "2026-10-03T00:00:00.000Z");
  const old = "2026-09-01T00:00:00Z";
  const recent = "2026-11-01T00:00:00Z";
  for (const status of ["submitted", "under_review", "needs_info"]) assert.equal(isPurgeable({ status, reviewed_at: old, updated_at: old }, cutoff), false);
  assert.equal(isPurgeable({ status: "approved", reviewed_at: old, updated_at: old }, cutoff), true);
  assert.equal(isPurgeable({ status: "rejected", reviewed_at: recent, updated_at: recent }, cutoff), false);
  assert.equal(isPurgeable({ status: "draft", reviewed_at: null, updated_at: old }, cutoff), true);
  assert.equal(isPurgeable({ status: "approved", reviewed_at: null, updated_at: old }, cutoff), false);
});
