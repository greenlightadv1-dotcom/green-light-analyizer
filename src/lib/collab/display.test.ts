import { strict as assert } from "node:assert";
import { test } from "node:test";
import { budgetRange as br, day, statusTone, usd as u } from "./display.ts";

const strip = (s: string) => s.replace(/[\u2066\u2069]/g, "");
const usd = (v: Parameters<typeof u>[0]) => strip(u(v));
const budgetRange = (a: number | null, b: number | null) => strip(br(a, b));

test("figures are LTR-isolated for Arabic text", () => {
  assert.equal(u(1500), "\u2066$1,500\u2069");
  assert.equal(br(500, 1500), "\u2066$500–$1,500\u2069");
  assert.equal(u(null), "");
});

test("usd formats deterministically", () => {
  assert.equal(usd(1500), "$1,500");
  assert.equal(usd("1500.5"), "$1,500.50");
  assert.equal(usd(1234567.89), "$1,234,567.89");
  assert.equal(usd(0), "$0");
  assert.equal(usd(null), "");
  assert.equal(usd("abc"), "");
});

test("budget ranges", () => {
  assert.equal(budgetRange(500, 1500), "$500–$1,500");
  assert.equal(budgetRange(500, 500), "$500");
  assert.equal(budgetRange(500, null), "$500+");
  assert.equal(budgetRange(null, 900), "≤ $900");
  assert.equal(budgetRange(null, null), "");
});

test("days are isolated for RTL and reject junk", () => {
  assert.equal(day("2026-11-02T10:00:00Z"), "⁦2026-11-02⁩");
  assert.equal(day("2026-11-02"), "⁦2026-11-02⁩");
  assert.equal(day("nope"), "");
  assert.equal(day(null), "");
});

test("every lifecycle status has a tone", () => {
  for (const s of ["draft", "published", "archived", "pending", "changes_requested", "accepted", "declined", "withdrawn", "negotiating", "active", "completed", "cancelled", "submitted", "revision_requested", "approved"]) {
    assert.notEqual(statusTone(s), undefined);
  }
  assert.equal(statusTone("unknown"), "neutral");
});
