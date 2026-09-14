import { strict as assert } from "node:assert";
import { test } from "node:test";

import { capRiskByVerification, HIGH_VALUE_DEAL_USD } from "./rules.ts";

/**
 * §7.4: "unverified audience data should never by itself produce a green
 * rating on a high-value deal."
 */

test("verified audience keeps green on a high-value deal", () => {
  const r = capRiskByVerification("green", true, HIGH_VALUE_DEAL_USD * 5);
  assert.equal(r.risk, "green");
  assert.equal(r.risk_capped, false);
});

test("unverified audience caps green to yellow on a high-value deal", () => {
  const r = capRiskByVerification("green", false, HIGH_VALUE_DEAL_USD);
  assert.equal(r.risk, "yellow");
  assert.equal(r.risk_capped, true);
});

test("unverified audience keeps green on a low-value deal", () => {
  const r = capRiskByVerification("green", false, HIGH_VALUE_DEAL_USD - 1);
  assert.equal(r.risk, "green");
  assert.equal(r.risk_capped, false);
});

test("the cap only ever downgrades — it never promotes a rating", () => {
  for (const verified of [true, false]) {
    for (const value of [0, HIGH_VALUE_DEAL_USD * 10]) {
      assert.equal(capRiskByVerification("red", verified, value).risk, "red");
      assert.equal(capRiskByVerification("yellow", verified, value).risk, "yellow");
    }
  }
});

test("the threshold is inclusive", () => {
  assert.equal(
    capRiskByVerification("green", false, HIGH_VALUE_DEAL_USD).risk,
    "yellow",
  );
});
