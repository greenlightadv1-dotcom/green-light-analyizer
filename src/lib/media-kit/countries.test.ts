import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  formatCountryShares,
  overlapWith,
  parseCountryShares,
} from "./countries.ts";

/**
 * §7.2 declared_top_countries is the one place a creator types free text into
 * a JSONB column, and overlapWith() is what turns it into a price. Both get
 * tested directly.
 */

test("parses the documented format", () => {
  const r = parseCountryShares("EG 40\nSA 25\nAE 15");
  assert.ok(r.ok);
  assert.deepEqual(r.value, [
    { country: "EG", pct: 40 },
    { country: "SA", pct: 25 },
    { country: "AE", pct: 15 },
  ]);
});

test("accepts the separators a person actually types", () => {
  for (const input of ["EG 40", "eg:40", "EG - 40", "EG 40%", "EG,40"]) {
    const r = parseCountryShares(input);
    assert.ok(r.ok, `${input} should parse`);
    assert.deepEqual(r.value, [{ country: "EG", pct: 40 }]);
  }
});

test("sorts largest share first — both readers treat it as a ranking", () => {
  const r = parseCountryShares("AE 15\nEG 40\nSA 25");
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.map((s) => s.country),
    ["EG", "SA", "AE"],
  );
});

test("empty input is valid and yields nothing", () => {
  const r = parseCountryShares("   \n  ");
  assert.ok(r.ok);
  assert.deepEqual(r.value, []);
});

test("rejects percentages that exceed 100 in total", () => {
  const r = parseCountryShares("EG 60\nSA 50");
  assert.ok(!r.ok);
  assert.match(r.error, /110%/);
});

test("rejects a duplicated country", () => {
  const r = parseCountryShares("EG 40\nEG 20");
  assert.ok(!r.ok);
  assert.match(r.error, /more than once/);
});

test("rejects out-of-range and malformed entries", () => {
  for (const input of ["EG 0", "EG 101", "EGY 40", "40 EG", "EG"]) {
    assert.ok(!parseCountryShares(input).ok, `${input} should be rejected`);
  }
});

test("format round-trips through parse", () => {
  const original = "EG 40\nSA 25";
  const parsed = parseCountryShares(original);
  assert.ok(parsed.ok);
  assert.equal(formatCountryShares(parsed.value), original);
});

test("overlap: full when every listed country is targeted", () => {
  const shares = [
    { country: "EG", pct: 60 },
    { country: "SA", pct: 40 },
  ];
  assert.equal(overlapWith(shares, ["EG", "SA"]), 1);
});

test("overlap: partial, and case-insensitive on both sides", () => {
  const shares = [
    { country: "EG", pct: 40 },
    { country: "US", pct: 60 },
  ];
  assert.equal(overlapWith(shares, ["eg"]), 0.4);
});

test("overlap: zero when the audience is nowhere the sponsor wants", () => {
  assert.equal(overlapWith([{ country: "EG", pct: 100 }], ["US"]), 0);
});

test("overlap: null audience is unknown, not zero", () => {
  // The distinction matters: unknown must not be priced as "nobody is there".
  assert.equal(overlapWith(null, ["EG"]), null);
  assert.equal(overlapWith([], ["EG"]), null);
});

test("overlap: no target countries means no geo penalty", () => {
  assert.equal(overlapWith([{ country: "EG", pct: 40 }], null), 1);
  assert.equal(overlapWith([{ country: "EG", pct: 40 }], []), 1);
});

test("handles CSV-style and mixed separators in one input", () => {
  // Regression: an earlier parser split on commas before reading pairs, so
  // "EG,40" broke into two unreadable halves.
  const r = parseCountryShares("EG,40\nSA,25");
  assert.ok(r.ok);
  assert.deepEqual(r.value, [
    { country: "EG", pct: 40 },
    { country: "SA", pct: 25 },
  ]);

  const inline = parseCountryShares("EG 40, SA 25, AE 15");
  assert.ok(inline.ok);
  assert.equal(inline.value.length, 3);
});

test("rejects trailing junk rather than silently dropping it", () => {
  const r = parseCountryShares("EG 40\nnot a country");
  assert.ok(!r.ok);
});

test("caps the list length", () => {
  const many = Array.from({ length: 11 }, (_, i) => `A${i} 1`).join("\n");
  assert.ok(!parseCountryShares(many).ok);
});
