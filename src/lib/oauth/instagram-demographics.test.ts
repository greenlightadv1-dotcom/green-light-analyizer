import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseFollowerCountries } from "./instagram-demographics.ts";

const response = (keys: string[], rows: [string[], number][]) => ({
  data: [
    {
      name: "follower_demographics",
      period: "lifetime",
      total_value: {
        breakdowns: [{ dimension_keys: keys, results: rows.map(([dimension_values, value]) => ({ dimension_values, value })) }],
      },
    },
  ],
});

test("follower_demographics: shares by country, largest first", () => {
  const shares = parseFollowerCountries(
    response(["timeframe", "country"], [
      [["LAST_90_DAYS", "EG"], 60],
      [["LAST_90_DAYS", "SA"], 30],
      [["LAST_90_DAYS", "AE"], 10],
    ]),
  );
  assert.deepEqual(shares, [
    { country: "EG", pct: 60 },
    { country: "SA", pct: 30 },
    { country: "AE", pct: 10 },
  ]);
});

test("the country is found by its key, not assumed to be last", () => {
  const shares = parseFollowerCountries(response(["country", "timeframe"], [[["eg", "LAST_90_DAYS"], 5]]));
  assert.deepEqual(shares, [{ country: "EG", pct: 100 }]);
});

test("bad rows are skipped and an empty or malformed answer is no data", () => {
  assert.deepEqual(
    parseFollowerCountries(response(["country"], [[["EG"], 3], [["Egypt"], 9], [["SA"], -2], [["AE"], 1]])),
    [
      { country: "EG", pct: 75 },
      { country: "AE", pct: 25 },
    ],
  );
  assert.equal(parseFollowerCountries(response(["country"], [])), null);
  assert.equal(parseFollowerCountries(response(["age"], [[["18-24"], 4]])), null);
  assert.equal(parseFollowerCountries({ data: [] }), null);
  assert.equal(parseFollowerCountries({ error: { message: "x" } }), null);
  assert.equal(parseFollowerCountries(null), null);
});
