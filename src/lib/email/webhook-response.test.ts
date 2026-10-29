import { strict as assert } from "node:assert";
import { test } from "node:test";

import { webhookResponseFor } from "./webhook-response.ts";

/** §5.3: the status code decides whether Resend redelivers. */

test("decided outcomes are acknowledged with 200", () => {
  for (const status of ["processed", "rejected", "unknown_alias"] as const) {
    assert.equal(webhookResponseFor(status).httpStatus, 200, status);
  }
});

test("a failure answers 500 so the provider retries", () => {
  assert.equal(webhookResponseFor("failed").httpStatus, 500);
});

test("a live claim answers 503 — never 200, which would end the retries", () => {
  const response = webhookResponseFor("in_progress");
  assert.equal(response.httpStatus, 503);
  assert.equal(response.headers["retry-after"], "120");
});
