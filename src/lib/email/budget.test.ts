import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  FETCH_BUDGET_MS,
  INTAKE_BUDGET_MS,
  POST_EVALUATION_RESERVE_MS,
  ROUTE_MAX_DURATION_MS,
  fetchDeadline,
  intakeDeadline,
} from "./budget.ts";
import { DEFAULT_ATTEMPTS, DEFAULT_TIMEOUT_MS } from "./received.ts";
import { NVIDIA_DEADLINE_MS } from "../ai/nvidia-config.ts";
import { STALE_CLAIM_MS } from "./claim.ts";

/** §5.3 request budget (review Finding 3). Arithmetic, not timing. */

test("the route declares the maxDuration the budget is planned against", () => {
  const route = readFileSync(new URL("../../app/api/webhooks/resend/route.ts", import.meta.url), "utf8");
  const declared = route.match(/export const maxDuration = (\d+);/);
  assert.ok(declared, "route must declare a literal maxDuration");
  assert.equal(Number(declared[1]) * 1000, ROUTE_MAX_DURATION_MS);
  assert.match(route, /intakeDeadline\(Date\.now\(\)\)/, "deadline taken from the request's arrival");
});

test("the intake budget plus the post-evaluation reserve is the route limit", () => {
  assert.equal(INTAKE_BUDGET_MS + POST_EVALUATION_RESERVE_MS, ROUTE_MAX_DURATION_MS);
  assert.ok(POST_EVALUATION_RESERVE_MS >= 5_000, "room for ~5 writes and the response");
});

test("the fetch budget cannot crowd out the model", () => {
  // What the model is left with if the fetch takes its whole budget at once.
  assert.ok(INTAKE_BUDGET_MS - FETCH_BUDGET_MS >= 40_000);
  // The fetch's own worst case without a budget would exceed it; the budget is
  // what bounds it.
  assert.ok(DEFAULT_ATTEMPTS * DEFAULT_TIMEOUT_MS > FETCH_BUDGET_MS);
});

test("old worst case vs new: fetch + model can no longer outlast the route", () => {
  const oldWorst = 8_300 + NVIDIA_DEADLINE_MS; // before: each budget counted from its own start
  assert.ok(oldWorst > ROUTE_MAX_DURATION_MS - POST_EVALUATION_RESERVE_MS);
  // Now the model stops at the intake deadline whatever the fetch took.
  const start = 0;
  assert.ok(intakeDeadline(start) <= ROUTE_MAX_DURATION_MS - POST_EVALUATION_RESERVE_MS);
});

test("fetchDeadline takes the earlier of its budget and the intake deadline", () => {
  const start = 1_000_000;
  const deadline = intakeDeadline(start);
  assert.equal(fetchDeadline(start, deadline), start + FETCH_BUDGET_MS);
  assert.equal(fetchDeadline(deadline - 1_000, deadline), deadline, "late arrival: capped by the intake");
});

test("a stale claim is older than any run the route allows", () => {
  assert.ok(STALE_CLAIM_MS > ROUTE_MAX_DURATION_MS);
});
