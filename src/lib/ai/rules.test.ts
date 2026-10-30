import { strict as assert } from "node:assert";
import { test } from "node:test";

import { capRiskByVerification, HIGH_VALUE_DEAL_USD, highValueBasisUsd } from "./rules.ts";

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

// --- high-value basis: the greater of offer and recommendation -----------------

test("the high-value basis is the greater of the offer and the recommendation", () => {
  assert.equal(highValueBasisUsd(200, 5000), 5000);
  assert.equal(highValueBasisUsd(2100, 500), 2100);
  assert.equal(highValueBasisUsd(800, 800), 800);
});

test("a missing or invalid value is ignored, never treated as high or as zero-and-max", () => {
  assert.equal(highValueBasisUsd(800, null), 800);
  assert.equal(highValueBasisUsd(800, undefined), 800);
  for (const bad of [Number.NaN, Infinity, -5000, 0]) assert.equal(highValueBasisUsd(800, bad), 800, String(bad));
  assert.equal(highValueBasisUsd(null, 1500), 1500);
  assert.equal(highValueBasisUsd(null, null), 0);
});

test("a high offer caps an unverified green even when the recommendation is low", () => {
  const basis = highValueBasisUsd(200, HIGH_VALUE_DEAL_USD * 5);
  assert.deepEqual(capRiskByVerification("green", false, basis), { risk: "yellow", risk_capped: true });
  // Before: judged on the $200 recommendation alone, so it stayed green.
  assert.equal(capRiskByVerification("green", false, 200).risk, "green");
});

test("verified geography still keeps green whatever the basis", () => {
  assert.equal(capRiskByVerification("green", true, highValueBasisUsd(200, 50_000)).risk, "green");
});
