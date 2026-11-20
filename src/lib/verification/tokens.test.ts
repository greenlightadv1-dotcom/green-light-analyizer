import { test } from "node:test";
import assert from "node:assert/strict";
import { activationErrorKey, hashToken, isTokenShape, newToken, sameHash, ACTIVATION_TTL_SECONDS, RESUME_TTL_SECONDS } from "./tokens.ts";

test("tokens are 256-bit, base64url, and only their SHA-256 is kept", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newToken();
    assert.ok(isTokenShape(t.raw));
    assert.match(t.hash, /^[0-9a-f]{64}$/);
    assert.equal(hashToken(t.raw), t.hash);
    assert.notEqual(t.hash, t.raw);
    assert.ok(!seen.has(t.raw));
    seen.add(t.raw);
  }
  // The stored value matches the database CHECK constraint on application_tokens.token_hash.
  assert.match(hashToken("x"), /^[0-9a-f]{64}$/);
});

test("malformed tokens are refused before any lookup", () => {
  for (const bad of ["", "short", "a".repeat(44), "a".repeat(42), `${"a".repeat(42)}!`, null, undefined, 42, `${"a".repeat(40)}../`]) {
    assert.equal(isTokenShape(bad), false);
  }
});

test("hash comparison is constant-time and length-safe", () => {
  const a = hashToken("one");
  assert.ok(sameHash(a, a));
  assert.ok(!sameHash(a, hashToken("two")));
  assert.ok(!sameHash(a, a.slice(2)));
});

test("lifetimes are bounded as the database requires (5 min to 30 days)", () => {
  for (const s of [ACTIVATION_TTL_SECONDS, RESUME_TTL_SECONDS]) assert.ok(s >= 300 && s <= 30 * 86400);
  assert.ok(ACTIVATION_TTL_SECONDS <= 72 * 3600, "activation links are short-lived");
});

test("database refusals map to known keys, anything else to a generic one", () => {
  assert.equal(activationErrorKey("activation:expired"), "activation.errors.expired");
  assert.equal(activationErrorKey('ERROR: activation:used CONTEXT ...'), "activation.errors.used");
  assert.equal(activationErrorKey("activation:drop_table"), "activation.errors.generic");
  assert.equal(activationErrorKey(null), "activation.errors.generic");
});
