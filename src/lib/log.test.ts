import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createLogger, type LogLevel } from "./log.ts";

/**
 * src/lib/log.ts is where §12's "never log contact details, offer text or
 * response bodies" stops being a convention at each call site, so the rules it
 * enforces are tested here rather than trusted.
 */

function capture() {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = [];
  const log = createLogger((level, line) => {
    assert.ok(!line.includes("\n"), "one event must be one line");
    lines.push({ level, entry: JSON.parse(line) });
  });
  return { log, lines };
}

test("writes one JSON line carrying level, event and fields", () => {
  const { log, lines } = capture();
  log.error("relay.failed", { status: 502, retried: false });
  assert.deepEqual(lines, [
    { level: "error", entry: { level: "error", event: "relay.failed", status: 502, retried: false } },
  ]);
});

test("masks contact details in every string, including third-party error text", () => {
  const { log, lines } = capture();
  log.error("emails_send.failed", {
    reason: "Resend returned 403: You can only send testing emails to your own email address (owner@gmail.com)",
    note: "call 01012345678 or wa.me/201012345678",
    error: new Error("duplicate key: deals@brand.example"),
  });
  const line = JSON.stringify(lines[0].entry);
  for (const leaked of ["owner@gmail.com", "01012345678", "wa.me", "deals@brand.example"]) {
    assert.ok(!line.includes(leaked), `${leaked} reached the log: ${line}`);
  }
  assert.match(line, /\[locked: email hidden by platform policy\]/);
});

test("keeps UUIDs and numbers intact — they are what make a line traceable", () => {
  const { log, lines } = capture();
  const id = "123e4567-e89b-12d3-a456-426614174000"; // 12-digit tail looks like a phone
  log.warn("relay.failed", { message_id: id, status: 429, retry_after_ms: 1500 });
  assert.equal(lines[0].entry.message_id, id);
  assert.equal(lines[0].entry.status, 429);
});

test("reduces an error to name, message, code and status — never details or cause", () => {
  const { log, lines } = capture();
  // The shape of a PostgrestError: `details` quotes the row that collided.
  const pgError = {
    message: "duplicate key value violates unique constraint",
    code: "23505",
    details: "Key (primary_email)=(creator@example.com) already exists.",
    hint: null,
  };
  const fetchError = Object.assign(new TypeError("fetch failed"), {
    cause: { headers: { authorization: "Bearer nvapi-secret" } },
    status: 503,
  });
  log.error("db.write_failed", { error: pgError, network: fetchError });
  assert.deepEqual(lines[0].entry.error, {
    message: "duplicate key value violates unique constraint",
    code: "23505",
  });
  assert.deepEqual(lines[0].entry.network, { name: "TypeError", message: "fetch failed", status: 503 });
  const line = JSON.stringify(lines[0].entry);
  assert.ok(!line.includes("creator@example.com"));
  assert.ok(!line.includes("nvapi-secret"));
  assert.ok(!line.includes("stack"));
});

test("caps long strings, so no caller can paste a body into a log by accident", () => {
  const { log, lines } = capture();
  log.warn("x", { detail: "a".repeat(10_000) });
  assert.ok((lines[0].entry.detail as string).length <= 301);
});

test("the cap cannot cut an address into an unmasked fragment", () => {
  const { log, lines } = capture();
  // The address straddles the 300-character cut.
  log.warn("x", { detail: `${"a ".repeat(145)}someone@example.com` });
  assert.ok(!JSON.stringify(lines[0].entry).includes("someone@"));
});

test("fields cannot overwrite level or event", () => {
  const { log, lines } = capture();
  log.info("real.event", { level: "error", event: "forged" });
  assert.equal(lines[0].entry.level, "info");
  assert.equal(lines[0].entry.event, "real.event");
});

test("drops undefined and functions, flattens arrays of primitives", () => {
  const { log, lines } = capture();
  log.warn("x", { gone: undefined, fn: () => 1, reasons: ["bulk", "no-reply", { a: 1 }] });
  assert.deepEqual(lines[0].entry, { level: "warn", event: "x", reasons: ["bulk", "no-reply", "[object]"] });
});

test("still logs the event when a field cannot be read", () => {
  const { log, lines } = capture();
  const hostile = {
    get message(): string {
      throw new Error("boom");
    },
  };
  log.error("x", { error: hostile });
  assert.deepEqual(lines[0].entry, { level: "error", event: "x", log_error: true });
});

test("warnOnce repeats nothing, but distinct fields are distinct warnings", () => {
  const { log, lines } = capture();
  for (let i = 0; i < 3; i++) {
    log.warnOnce("discord.unconfigured", { channel: "github" });
    log.warnOnce("discord.unconfigured", { channel: "deploys" });
  }
  assert.equal(lines.length, 2);
});
