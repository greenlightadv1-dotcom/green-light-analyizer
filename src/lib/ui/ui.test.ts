import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTabIndex } from "./tabs.ts";
import { clampPage, paginationItems } from "./pagination.ts";
import { DEAL_STATUS_LABEL_KEY, DEAL_STATUS_TONE, TONE_CLASSES, dealStatusChangeNeedsConfirm } from "./status.ts";

const none = [false, false, false, false];

test("tabs: arrows follow the reading direction and wrap", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, none, "ltr"), 1);
  assert.equal(nextTabIndex("ArrowLeft", 0, none, "ltr"), 3);
  assert.equal(nextTabIndex("ArrowRight", 3, none, "ltr"), 0);
  // RTL: the next tab sits to the left on screen.
  assert.equal(nextTabIndex("ArrowLeft", 0, none, "rtl"), 1);
  assert.equal(nextTabIndex("ArrowRight", 0, none, "rtl"), 3);
});

test("tabs: Home/End and disabled tabs are skipped", () => {
  const d = [true, false, true, false];
  assert.equal(nextTabIndex("Home", 3, d), 1);
  assert.equal(nextTabIndex("End", 1, d), 3);
  assert.equal(nextTabIndex("ArrowRight", 1, d), 3);
  assert.equal(nextTabIndex("ArrowRight", 3, d), 1);
  assert.equal(nextTabIndex("Enter", 1, d), null);
  assert.equal(nextTabIndex("ArrowRight", 0, []), null);
  assert.equal(nextTabIndex("ArrowRight", 0, [true, true]), null);
});

test("pagination: small ranges list every page", () => {
  assert.deepEqual(paginationItems(1, 0), []);
  assert.deepEqual(paginationItems(1, 1), [1]);
  assert.deepEqual(paginationItems(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("pagination: large ranges keep first, last, a window and gaps", () => {
  assert.deepEqual(paginationItems(1, 20), [1, 2, 3, 4, 5, "gap", 20]);
  assert.deepEqual(paginationItems(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
  assert.deepEqual(paginationItems(20, 20), [1, "gap", 16, 17, 18, 19, 20]);
  for (let p = 1; p <= 40; p++) {
    const items = paginationItems(p, 40);
    assert.ok(items.length <= 7, `page ${p}: ${items.length} items`);
    assert.ok(items.includes(p), `page ${p} missing`);
    assert.equal(items[0], 1);
    assert.equal(items.at(-1), 40);
  }
  // Out-of-range input is clamped rather than rendering nonsense.
  assert.deepEqual(paginationItems(99, 3), [1, 2, 3]);
});

test("clampPage: invalid input becomes page 1, large input the last page", () => {
  assert.equal(clampPage("abc", 5), 1);
  assert.equal(clampPage(undefined, 5), 1);
  assert.equal(clampPage("3", 5), 3);
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(9, 5), 5);
  assert.equal(clampPage(2, 0), 1);
});

test("status: every deal status has a tone, a label key and classes", () => {
  for (const s of ["new", "negotiating", "agreed", "paid", "disputed"] as const) {
    assert.ok(TONE_CLASSES[DEAL_STATUS_TONE[s]]);
    assert.match(DEAL_STATUS_LABEL_KEY[s], /^badges\.status/);
  }
  // Tone classes use semantic tokens only, never raw palette colours.
  for (const cls of Object.values(TONE_CLASSES)) {
    assert.doesNotMatch(cls, /(red|amber|green|sky|orange)-\d/);
  }
});

test("status: any real change needs confirmation; re-selecting does not", () => {
  assert.equal(dealStatusChangeNeedsConfirm("new", "agreed"), true);
  assert.equal(dealStatusChangeNeedsConfirm("agreed", "paid"), true);
  assert.equal(dealStatusChangeNeedsConfirm("agreed", "agreed"), false);
});
