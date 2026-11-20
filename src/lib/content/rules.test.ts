import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contentErrorKey, monthGrid, parseContentItem, parseMonth, shiftMonth } from "./rules.ts";

test("content items are validated", () => {
  const ok = parseContentItem({ kind: "script", title: "Launch", body: "Line 1\r\nLine 2", status: "scheduled", planned_for: "2026-11-20", tags: "#tech, tech, review", platform: "youtube" });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.body, "Line 1\nLine 2");
    assert.deepEqual(ok.value.tags, ["tech", "review"]);
  }
  assert.deepEqual(parseContentItem({ kind: "podcast", title: "x" }), { ok: false, errorKey: "content.errors.kind" });
  assert.deepEqual(parseContentItem({ kind: "idea", title: "" }), { ok: false, errorKey: "content.errors.title" });
  assert.deepEqual(parseContentItem({ kind: "idea", title: "x", status: "scheduled" }), { ok: false, errorKey: "content.errors.scheduled_date" });
  assert.deepEqual(parseContentItem({ kind: "idea", title: "x", planned_for: "2026-02-30x" }), { ok: false, errorKey: "content.errors.date" });
  assert.deepEqual(parseContentItem({ kind: "idea", title: "x", tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(",") }), { ok: false, errorKey: "content.errors.tags" });
  const noCollab = parseContentItem({ kind: "idea", title: "x", collaboration_id: "not-a-uuid" });
  assert.ok(noCollab.ok && noCollab.value.collaboration_id === null);
});

test("calendar months and grid", () => {
  assert.deepEqual(parseMonth("2026-11", "2026-01-05"), { year: 2026, month: 11 });
  assert.deepEqual(parseMonth("2026-13", "2026-01-05"), { year: 2026, month: 1 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  const g = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
  assert.equal(g[0][6], "2026-11-01");
  assert.equal(g[0][0], null);
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g.flat().filter(Boolean).length, 30);
});

test("refusals map to keys", () => {
  assert.equal(contentErrorKey("content:too_many"), "content.errors.too_many");
  assert.equal(contentErrorKey("other"), "ui.errors.generic");
});

test("content actions are creator-only and scoped to the session", () => {
  const src = readFileSync(new URL("../../app/(app)/content/actions.ts", import.meta.url), "utf8");
  for (const fn of src.split("\nexport async function ").slice(1)) assert.match(fn, /requireRole\("creator"\)/);
  assert.match(src, /\.eq\("creator_id", profile\.id\)/);
  assert.match(src, /creator_id: profile\.id/);
  assert.doesNotMatch(src, /fd\.get\("creator_id"\)/);
});
