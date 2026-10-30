import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AUDIENCE_GEO_WINDOW_DAYS,
  MAX_COUNTRIES,
  audienceGeoFromReport,
  buildCountryViewsQuery,
  parseCountryViewsReport,
  reportWindow,
  toCountryShares,
  verifiedGeoUpdate,
  type AudienceGeoResult,
} from "./youtube-geo.ts";

/** §7.2/§7.3 YouTube verified geography (Stage 1, D2). No network. */

const NOW = new Date("2026-10-30T10:00:00.000Z");

/** The documented youtubeAnalytics#resultTable shape. */
function report(rows: unknown, overrides: Record<string, unknown> = {}) {
  return {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "country", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
    ],
    ...(rows === undefined ? {} : { rows }),
    ...overrides,
  };
}

const sum = (xs: { pct: number }[]) => xs.reduce((s, x) => s + x.pct, 0);

// --- query ------------------------------------------------------------------

test("queries views by country — never viewerPercentage", () => {
  const q = buildCountryViewsQuery("UC123", NOW);
  assert.equal(q.get("ids"), "channel==UC123");
  assert.equal(q.get("metrics"), "views");
  assert.equal(q.get("dimensions"), "country");
  assert.equal(q.get("sort"), "-views");
  assert.equal(q.get("maxResults"), null, "every row is needed for the total");
  assert.ok(!q.toString().includes("viewerPercentage"));
});

test("the window is a fixed 90 days ending yesterday (UTC)", () => {
  assert.deepEqual(reportWindow(NOW), { startDate: "2026-08-01", endDate: "2026-10-29" });
  const days =
    (Date.parse(reportWindow(NOW).endDate) - Date.parse(reportWindow(NOW).startDate)) / 86_400_000 + 1;
  assert.equal(days, AUDIENCE_GEO_WINDOW_DAYS);
  // Month and year boundaries.
  assert.deepEqual(reportWindow(new Date("2026-01-01T00:30:00Z")), { startDate: "2025-10-03", endDate: "2025-12-31" });
  const q = buildCountryViewsQuery("UC1", NOW);
  assert.equal(q.get("startDate"), "2026-08-01");
  assert.equal(q.get("endDate"), "2026-10-29");
});

// --- valid data and percentages ---------------------------------------------

test("valid country views become percentages of the same window's total", () => {
  const result = audienceGeoFromReport(report([["EG", 500], ["SA", 300], ["US", 200]]), NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.countries, [
    { country: "EG", pct: 50 },
    { country: "SA", pct: 30 },
    { country: "US", pct: 20 },
  ]);
  assert.equal(result.totalViews, 1000);
  assert.equal(result.startDate, "2026-08-01");
  assert.equal(result.endDate, "2026-10-29");
});

test("column order is read from columnHeaders, not assumed", () => {
  const swapped = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "country", columnType: "DIMENSION", dataType: "STRING" },
    ],
    rows: [[750, "AE"], [250, "KW"]],
  };
  const result = audienceGeoFromReport(swapped, NOW);
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(result.countries, [{ country: "AE", pct: 75 }, { country: "KW", pct: 25 }]);
});

test("rounding: the full distribution sums to exactly 100 (largest remainder)", () => {
  // 1/3 each: independent rounding would give 33+33+33 = 99.
  const thirds = toCountryShares([{ country: "EG", views: 1 }, { country: "SA", views: 1 }, { country: "US", views: 1 }]);
  assert.ok(thirds.ok);
  if (thirds.ok) {
    assert.equal(sum(thirds.countries), 100);
    // The leftover point goes deterministically (equal remainders, equal views -> country code).
    assert.deepEqual(thirds.countries.map((c) => c.pct), [34, 33, 33]);
    assert.equal(thirds.countries[0].country, "EG");
  }

  // Many uneven shares still total 100.
  const uneven = toCountryShares(
    [137, 291, 13, 77, 452, 9, 21].map((views, i) => ({ country: ["AE", "BH", "DZ", "EG", "IQ", "JO", "KW"][i], views })),
  );
  assert.ok(uneven.ok);
  if (uneven.ok) assert.equal(sum(uneven.countries), 100);
});

test("rounding: the largest fractional parts receive the leftover points", () => {
  // Exact shares 66.6, 16.7, 16.7 -> floors 66,16,16 (98). The 2 leftover
  // points go to the two largest remainders (.7, .7), not to the .6.
  const r = toCountryShares([{ country: "EG", views: 666 }, { country: "SA", views: 167 }, { country: "US", views: 167 }]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(sum(r.countries), 100);
    assert.deepEqual(r.countries, [{ country: "EG", pct: 66 }, { country: "SA", pct: 17 }, { country: "US", pct: 17 }]);
  }
});

test("unknown-country views count toward the total but are not listed", () => {
  const result = audienceGeoFromReport(report([["EG", 600], ["ZZ", 300], ["SA", 100]]), NOW);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.countries, [{ country: "EG", pct: 60 }, { country: "SA", pct: 10 }]);
  assert.ok(!result.countries.some((c) => c.country === "ZZ"));
  assert.equal(result.totalViews, 1000);
});

test("at most MAX_COUNTRIES are kept, the largest by views; 0% countries are dropped", () => {
  const rows = Array.from({ length: 15 }, (_, i) => [String.fromCharCode(65 + i) + "A", 1000 - i * 10]);
  rows.push(["QQ", 1]); // a sliver that rounds to 0%
  const result = audienceGeoFromReport(report(rows), NOW);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.countries.length, MAX_COUNTRIES);
  assert.equal(result.countries[0].country, "AA");
  assert.ok(!result.countries.some((c) => c.country === "QQ"));
});

// --- empty and zero ----------------------------------------------------------

test("no rows (the API omits `rows`) is no_data, not an empty success", () => {
  assert.deepEqual(audienceGeoFromReport(report(undefined), NOW), { ok: false, reason: "no_data" });
  assert.deepEqual(audienceGeoFromReport(report([]), NOW), { ok: false, reason: "no_data" });
});

test("zero total views is no_data — no division by zero", () => {
  assert.deepEqual(audienceGeoFromReport(report([["EG", 0], ["SA", 0]]), NOW), { ok: false, reason: "no_data" });
});

test("only unknown-country views is no_data", () => {
  assert.deepEqual(audienceGeoFromReport(report([["ZZ", 1000]]), NOW), { ok: false, reason: "no_data" });
});

// --- malformed ---------------------------------------------------------------

test("malformed responses are malformed, never an empty or partial success", () => {
  for (const body of [
    null,
    "a string",
    [["EG", 1]],
    {},
    report([["EG", 1]], { kind: "youtube#somethingElse" }),
    { kind: "youtubeAnalytics#resultTable", rows: [["EG", 1]] }, // no headers
    { ...report([["EG", 1]]), columnHeaders: [{ name: "country" }, { name: "viewerPercentage" }] },
    report("not an array"),
    report([["EG", 1], "not a row"]),
    report([["Egypt", 1]]), // not an ISO-3166 alpha-2 code
    report([["eg", 1]]),
    report([["EG", "100"]]), // views as a string
    report([["EG", 1.5]]),
    report([["EG", -3]]),
    report([["EG", Number.NaN]]),
  ]) {
    assert.deepEqual(audienceGeoFromReport(body, NOW), { ok: false, reason: "malformed" }, JSON.stringify(body));
  }
});

test("one bad row poisons the whole report instead of being skipped", () => {
  assert.deepEqual(parseCountryViewsReport(report([["EG", 500], ["SA", "x"]])), { ok: false, reason: "malformed" });
});

// --- the sync decision: failures can never verify ----------------------------

test("only a successful result with countries produces a verified update", () => {
  const ok = audienceGeoFromReport(report([["EG", 3], ["SA", 1]]), NOW);
  const outcome = verifiedGeoUpdate(ok);
  assert.equal(outcome.error, null);
  assert.deepEqual(outcome.update, {
    verified_top_countries: [{ country: "EG", pct: 75 }, { country: "SA", pct: 25 }],
    audience_verified: true,
  });
});

test("every failure yields an error and no update — never audience_verified", () => {
  const failures: AudienceGeoResult[] = [
    { ok: false, reason: "http_error", status: 400 },
    { ok: false, reason: "http_error", status: 401 },
    { ok: false, reason: "http_error", status: 403 },
    { ok: false, reason: "http_error", status: 500 },
    { ok: false, reason: "network" },
    { ok: false, reason: "malformed" },
    { ok: false, reason: "no_data" },
    // Defensive: an ok result that somehow carries no countries.
    { ok: true, countries: [], totalViews: 10, startDate: "2026-08-01", endDate: "2026-10-29" },
  ];
  for (const failure of failures) {
    const outcome = verifiedGeoUpdate(failure);
    assert.equal(outcome.update, null, JSON.stringify(failure));
    assert.equal(typeof outcome.error, "string");
    assert.ok(outcome.error!.length > 0);
  }
});

test("errors tell the creator what to do", () => {
  assert.match(verifiedGeoUpdate({ ok: false, reason: "http_error", status: 403 }).error!, /reconnect/);
  assert.match(verifiedGeoUpdate({ ok: false, reason: "http_error", status: 401 }).error!, /reconnect/);
  assert.match(verifiedGeoUpdate({ ok: false, reason: "no_data" }).error!, /no country data/);
  assert.match(verifiedGeoUpdate({ ok: false, reason: "network" }).error!, /try again/);
});
