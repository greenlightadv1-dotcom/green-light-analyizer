import { strict as assert } from "node:assert";
import { test } from "node:test";

import { daysUntil, extendExpiry } from "./subscription.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

test("extendExpiry adds days from now when there is no current expiry", () => {
  const result = extendExpiry(null, 30);
  const expectedMs = Date.now() + 30 * DAY_MS;
  assert.ok(Math.abs(new Date(result).getTime() - expectedMs) < 5000);
});

test("extendExpiry adds days from now when the current expiry already passed", () => {
  const past = isoIn(-10 * DAY_MS);
  const result = extendExpiry(past, 14);
  const expectedMs = Date.now() + 14 * DAY_MS;
  assert.ok(Math.abs(new Date(result).getTime() - expectedMs) < 5000);
});

test("extendExpiry adds to remaining time rather than resetting it", () => {
  // 10 days left, renewed for 30 -> 40 days left, not 30 -- renewing adds
  // paid time, it does not discard time already paid for.
  const current = isoIn(10 * DAY_MS);
  const result = extendExpiry(current, 30);
  const expectedMs = new Date(current).getTime() + 30 * DAY_MS;
  assert.ok(Math.abs(new Date(result).getTime() - expectedMs) < 5000);
});

test("daysUntil rounds up and goes negative once clearly past", () => {
  assert.equal(daysUntil(isoIn(2 * DAY_MS + 1000)), 3);
  assert.equal(daysUntil(isoIn(-DAY_MS - 1000)), -1);
});
