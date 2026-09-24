import test from "node:test";
import assert from "node:assert/strict";

import {
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_ENDPOINT,
  NVIDIA_TIMEOUT_MS,
  describeKey,
  isHeaderSafe,
  resolveNvidia,
} from "./nvidia-config.ts";

test("a key produces a usable provider on the documented endpoint", () => {
  const provider = resolveNvidia({ NVIDIA_API_KEY: "nv-key" });
  assert.ok(provider);
  assert.equal(provider.endpoint, NVIDIA_ENDPOINT);
  assert.equal(provider.apiKey, "nv-key");
  assert.equal(provider.model, NVIDIA_DEFAULT_MODEL);
});

test("the default model is the one the docs name", () => {
  assert.equal(NVIDIA_DEFAULT_MODEL, "z-ai/glm-5.3");
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

test("the call fits inside a 60s serverless budget", () => {
  // Load-bearing: the inbound webhook waits on this synchronously, and a
  // function the platform kills mid-call returns nothing at all — not even
  // the rule-based estimate.
  assert.ok(NVIDIA_TIMEOUT_MS < 60_000);
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

test("isHeaderSafe rejects what fetch would throw on", () => {
  assert.ok(isHeaderSafe("nvapi-abcDEF123-_"));
  assert.ok(!isHeaderSafe("nvapi-\u00e9"));   // non-ASCII
  assert.ok(!isHeaderSafe("nvapi-abc def"));  // space
  assert.ok(!isHeaderSafe(""));
});
