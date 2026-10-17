import test from "node:test";
import assert from "node:assert/strict";

import {
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_ENDPOINT,
  NVIDIA_ATTEMPT_MS,
  NVIDIA_DEADLINE_MS,
  NVIDIA_MIN_RETRY_MS,
  REQUIRED_MAX_DURATION,
  describeKey,
  isHeaderSafe,
  parseRetryAfterMs,
  resolveNvidia,
} from "./nvidia-config.ts";

test("a key produces a usable provider on the documented endpoint", () => {
  const provider = resolveNvidia({ NVIDIA_API_KEY: "nv-key" });
  assert.ok(provider);
  assert.equal(provider.endpoint, NVIDIA_ENDPOINT);
  assert.equal(provider.apiKey, "nv-key");
  assert.equal(provider.model, NVIDIA_DEFAULT_MODEL);
});

test("the default model is text-only, which is all this workload needs", () => {
  // A vision model pays for a capability chat.ts can never give it — nothing
  // in the product can put an image in `messages` — and answers more slowly
  // for it. That is what produced the 45s timeouts.
  assert.equal(NVIDIA_DEFAULT_MODEL, "meta/llama-3.3-70b-instruct");
  assert.doesNotMatch(NVIDIA_DEFAULT_MODEL, /vision/i);
});

test("no key means null — a supported state, since every caller has a fallback", () => {
  assert.equal(resolveNvidia({}), null);
});

test("a whitespace-only key counts as absent", () => {
  // Pasting an empty value into a Vercel env var is a real way to get here,
  // and a blank Bearer token fails every request at the provider instead.
  assert.equal(resolveNvidia({ NVIDIA_API_KEY: "   " }), null);
});

test("wrapping quotes are stripped from the key and the model", () => {
  // A value pasted into a Vercel env var as "nvapi-..." keeps its quotes, and
  // the resulting Bearer header is rejected as an invalid key — a 401 that
  // sends everyone hunting a revoked key that is actually fine.
  const provider = resolveNvidia({
    NVIDIA_API_KEY: '"nvapi-abc"',
    NVIDIA_MODEL: "'vendor/model'",
  });
  assert.equal(provider?.apiKey, "nvapi-abc");
  assert.equal(provider?.model, "vendor/model");
});

test("a key that is nothing but quotes counts as absent", () => {
  assert.equal(resolveNvidia({ NVIDIA_API_KEY: '""' }), null);
});

test("the model is overridable without a code change", () => {
  const provider = resolveNvidia({
    NVIDIA_API_KEY: "nv-key",
    NVIDIA_MODEL: "vendor/other-model",
  });
  assert.equal(provider?.model, "vendor/other-model");
});

test("an empty NVIDIA_MODEL falls back to the default rather than sending nothing", () => {
  const provider = resolveNvidia({ NVIDIA_API_KEY: "nv-key", NVIDIA_MODEL: "  " });
  assert.equal(provider?.model, NVIDIA_DEFAULT_MODEL);
});

test("reasoning_effort is opt-in and absent by default", () => {
  assert.equal(resolveNvidia({ NVIDIA_API_KEY: "nv-key" })?.extraBody, undefined);
  assert.deepEqual(
    resolveNvidia({ NVIDIA_API_KEY: "nv-key", NVIDIA_REASONING_EFFORT: "high" })?.extraBody,
    { reasoning_effort: "high" },
  );
});

test("the AI deadline leaves the function real headroom, not zero", () => {
  // The whole point. A 60s AI budget under a 60s maxDuration means the
  // platform kills the function at the instant the abort fires: no rule-based
  // fallback, no error on screen, no log line. The request just vanishes.
  // Everything downstream of the model — creating the deal room, writing the
  // messages, the WhatsApp alert — has to still fit.
  const headroom = REQUIRED_MAX_DURATION * 1000 - NVIDIA_DEADLINE_MS;
  assert.ok(headroom >= 8_000, `only ${headroom}ms of headroom`);
});

test("two attempts fit inside the deadline", () => {
  assert.ok(NVIDIA_ATTEMPT_MS + NVIDIA_MIN_RETRY_MS <= NVIDIA_DEADLINE_MS);
});

test("a single attempt cannot itself exhaust the deadline", () => {
  assert.ok(NVIDIA_ATTEMPT_MS < NVIDIA_DEADLINE_MS);
});

test("the provider carries both budgets", () => {
  const provider = resolveNvidia({ NVIDIA_API_KEY: "nvapi-x" });
  assert.equal(provider?.attemptMs, NVIDIA_ATTEMPT_MS);
  assert.equal(provider?.deadlineMs, NVIDIA_DEADLINE_MS);
});

test("a right-to-left mark on the key is stripped, and reported", () => {
  // The likeliest way a verified key still 401s for this team: copying a
  // Latin-script credential out of Arabic context inserts U+200F, which
  // survives trim() and corrupts the Bearer token invisibly.
  const provider = resolveNvidia({ NVIDIA_API_KEY: "\u200Fnvapi-abcdef\u200F" });
  assert.equal(provider?.apiKey, "nvapi-abcdef");
  assert.deepEqual(provider?.keyNotes, ["zero-width or bidi marks"]);
});

test("a zero-width space or BOM is stripped too", () => {
  assert.equal(resolveNvidia({ NVIDIA_API_KEY: "\uFEFFnvapi-x\u200B" })?.apiKey, "nvapi-x");
});

test('a "Bearer " prefix pasted into the value is removed', () => {
  // Otherwise the header reads `Authorization: Bearer Bearer nvapi-...`.
  const provider = resolveNvidia({ NVIDIA_API_KEY: "Bearer nvapi-abcdef" });
  assert.equal(provider?.apiKey, "nvapi-abcdef");
  assert.ok(provider?.keyNotes.some((n) => n.includes("bearer") || n.includes("Bearer")));
});

test("whitespace from a paste that wrapped across lines is removed", () => {
  assert.equal(
    resolveNvidia({ NVIDIA_API_KEY: "nvapi-abc\n def" })?.apiKey,
    "nvapi-abcdef",
  );
});

test("every stripped fault is named, so the 401 log says which one", () => {
  const provider = resolveNvidia({ NVIDIA_API_KEY: '"Bearer nvapi-abc\u200F"' });
  assert.equal(provider?.apiKey, "nvapi-abc");
  assert.equal(provider?.keyNotes.length, 3);
});

test("describeKey gives shape without giving the key", () => {
  const described = describeKey("nvapi-supersecretvalue", ["wrapping quotes"]);
  assert.match(described, /22 chars/);
  assert.match(described, /starts "nvapi-"/);
  assert.match(described, /wrapping quotes/);
  assert.doesNotMatch(described, /supersecret/);
});

test("describeKey echoes no prefix for a credential that is not an nvapi- key", () => {
  // The 401 advice tells the operator to suspect an NGC or org key — exactly
  // the shape where six characters would be six real characters of a live
  // credential. The length still distinguishes corrupted from revoked.
  const described = describeKey("ngc_abcdefghijklmnop", []);
  assert.match(described, /20 chars/);
  assert.doesNotMatch(described, /ngc_ab/);
  assert.match(described, /does not start/);
});

test("describeKey never echoes a short typo'd value", () => {
  assert.doesNotMatch(describeKey("abcd", []), /abcd/);
});

test("a Bearer prefix is stripped even when the paste wrapped after it", () => {
  // `.` does not match a newline, so the old regex missed this and the
  // whitespace strip then glued the prefix on as "Bearernvapi-abcdef".
  const provider = resolveNvidia({ NVIDIA_API_KEY: "Bearer nvapi-abc\ndef" });
  assert.equal(provider?.apiKey, "nvapi-abcdef");
  assert.ok(provider?.keyNotes.some((n) => n.toLowerCase().includes("bearer")));
});

test("isHeaderSafe rejects what fetch would throw on", () => {
  assert.ok(isHeaderSafe("nvapi-abcDEF123-_"));
  assert.ok(!isHeaderSafe("nvapi-\u00e9"));   // non-ASCII
  assert.ok(!isHeaderSafe("nvapi-abc def"));  // space
  assert.ok(!isHeaderSafe(""));
});

test("Retry-After in seconds is honoured", () => {
  assert.equal(parseRetryAfterMs("5"), 5_000);
  assert.equal(parseRetryAfterMs(" 2 "), 2_000);
});

test("Retry-After as an HTTP date is honoured", () => {
  const ms = parseRetryAfterMs(new Date(Date.now() + 8_000).toUTCString());
  assert.ok(ms > 5_000 && ms <= 9_000, `got ${ms}`);
});

test("an absent, empty or unparseable Retry-After means no wait", () => {
  for (const header of [null, "", "   ", "soon", "NaN"]) {
    assert.equal(parseRetryAfterMs(header), 0, `header: ${JSON.stringify(header)}`);
  }
});

test("a negative or past Retry-After means no wait, never a negative one", () => {
  assert.equal(parseRetryAfterMs("-10"), 0);
  assert.equal(parseRetryAfterMs(new Date(Date.now() - 60_000).toUTCString()), 0);
});

test("an absurd Retry-After is capped, so it cannot swallow the whole deadline", () => {
  // Uncapped, a server naming an hour would make the loop sit on the budget
  // and the caller would lose its fallback as well as the call.
  assert.ok(parseRetryAfterMs("3600") <= NVIDIA_DEADLINE_MS);
  assert.ok(parseRetryAfterMs("99999") <= NVIDIA_DEADLINE_MS);
});
