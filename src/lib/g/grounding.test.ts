import { strict as assert } from "node:assert";
import { test } from "node:test";

import { figuresIn, ungroundedFigures } from "./conversation.ts";

/** G's grounding check: a reply may only state figures it was given. */

const data = JSON.stringify({ avg_views: 12345, engagement_rate: 4.2, base_rate_usd: 1200, threshold: 4, verified_pct: 60 });

test("figures are read with separators, decimals, units and Arabic-Indic digits", () => {
  assert.deepEqual(figuresIn("12,345 views and 4.2%").map((f) => f.value), [12345, 4.2]);
  assert.deepEqual(figuresIn("$1,200").map((f) => f.unit), [true]);
  assert.deepEqual(figuresIn("12.3k").map((f) => f.value), [12300]);
  assert.deepEqual(figuresIn("٦٠٪").map((f) => f.value), [60]);
});

test("a reply that only restates DATA passes, within display rounding", () => {
  assert.deepEqual(ungroundedFigures("Average views 12,345 (synced); engagement 4.2% is above the 4% default.", [data]), []);
  assert.deepEqual(ungroundedFigures("About 12.3K average views and a $1,200 base rate.", [data]), []);
  assert.deepEqual(ungroundedFigures("متوسط المشاهدات ١٢٣٤٥ و٦٠٪ من الجمهور في مصر.", [data]), []);
});

test("an invented metric, price or percentage is caught", () => {
  assert.deepEqual(ungroundedFigures("Your engagement is 8.5%.", [data]), [8.5]);
  assert.deepEqual(ungroundedFigures("You should charge $3,000 for this.", [data]), [3000]);
  assert.deepEqual(ungroundedFigures("You have 250,000 subscribers.", [data]), [250000]);
  // A small percentage is still a metric.
  assert.deepEqual(ungroundedFigures("Engagement is 7%.", [data]), [7]);
});

test("list numbering and small counts are not treated as metrics", () => {
  assert.deepEqual(ungroundedFigures("1. Add a bio\n2. Connect YouTube\nI found 3 creators.", [data]), []);
});

test("figures the user typed themselves are grounded", () => {
  assert.deepEqual(ungroundedFigures("With a $5,000 budget, start with the first two.", [data, "my budget is 5000 dollars"]), []);
});
