import { strict as assert } from "node:assert";
import { test } from "node:test";

import { expectedSignature, verifyWebhookSignature } from "./verify.ts";

/**
 * §5.3 webhook signature verification.
 *
 * This is the only thing standing between the public internet and a function
 * that creates deal rooms and spends money on a paid AI API, so the negative
 * cases matter more than the positive one.
 */

/** Test fixture, not a credential — an invented key of the right shape. */
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_2abc";
const BODY = JSON.stringify({ type: "email.received", data: { id: "m1" } });

function signed(now = Date.now(), body = BODY, id = ID) {
  const timestamp = Math.floor(now / 1000).toString();
  return {
    secret: SECRET,
    id,
    timestamp,
    signatureHeader: `v1,${expectedSignature(SECRET, id, timestamp, body)}`,
    body,
    now,
  };
}

test("accepts a correctly signed delivery", () => {
  assert.equal(verifyWebhookSignature(signed()).ok, true);
});

test("accepts when several signatures are present (secret rotation)", () => {
  const args = signed();
  assert.equal(
    verifyWebhookSignature({
      ...args,
      signatureHeader: `v1,ZmFrZXNpZ25hdHVyZXZhbHVlZmFrZXNpZ25hdA== ${args.signatureHeader}`,
    }).ok,
    true,
  );
});

test("rejects a tampered body — the whole point of signing", () => {
  const args = signed();
  const tampered = verifyWebhookSignature({
    ...args,
    body: JSON.stringify({ type: "email.received", data: { id: "attacker" } }),
  });
  assert.equal(tampered.ok, false);
});

test("rejects a wrong secret", () => {
  const args = signed();
  const r = verifyWebhookSignature({ ...args, secret: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
  assert.equal(r.ok, false);
});

test("rejects a signature lifted from a different delivery id", () => {
  const args = signed();
  assert.equal(verifyWebhookSignature({ ...args, id: "msg_other" }).ok, false);
});

test("rejects a replayed delivery outside the timestamp window", () => {
  const oldTime = Date.now() - 10 * 60 * 1000;
  const args = signed(oldTime);
  // Signature is genuine; only the clock has moved on.
  const r = verifyWebhookSignature({ ...args, now: Date.now() });
  assert.equal(r.ok, false);
  assert.match(r.reason, /timestamp/);
});

test("accepts a delivery inside the window on either side of now", () => {
  for (const skew of [-60_000, 60_000]) {
    const args = signed(Date.now() + skew);
    assert.equal(
      verifyWebhookSignature({ ...args, now: Date.now() }).ok,
      true,
      `skew ${skew} should be tolerated`,
    );
  }
});

test("rejects missing headers rather than treating them as absent-and-fine", () => {
  const args = signed();
  assert.equal(verifyWebhookSignature({ ...args, id: null }).ok, false);
  assert.equal(verifyWebhookSignature({ ...args, timestamp: null }).ok, false);
  assert.equal(verifyWebhookSignature({ ...args, signatureHeader: null }).ok, false);
});

test("rejects an unconfigured secret instead of falling open", () => {
  const args = signed();
  const r = verifyWebhookSignature({ ...args, secret: "" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /secret/);
});

test("rejects a malformed timestamp", () => {
  const args = signed();
  assert.equal(verifyWebhookSignature({ ...args, timestamp: "not-a-number" }).ok, false);
});

test("rejects an unknown signature version", () => {
  const args = signed();
  const value = args.signatureHeader.split(",")[1];
  assert.equal(
    verifyWebhookSignature({ ...args, signatureHeader: `v0,${value}` }).ok,
    false,
  );
});

test("rejects an empty signature header", () => {
  const args = signed();
  assert.equal(verifyWebhookSignature({ ...args, signatureHeader: "" }).ok, false);
  assert.equal(verifyWebhookSignature({ ...args, signatureHeader: "v1," }).ok, false);
});

test("a signature of the right length but wrong bytes fails", () => {
  // Guards the constant-time compare: equal lengths must still be rejected.
  const args = signed();
  const good = args.signatureHeader.split(",")[1];
  const flipped = (good[0] === "A" ? "B" : "A") + good.slice(1);
  assert.equal(flipped.length, good.length);
  assert.equal(verifyWebhookSignature({ ...args, signatureHeader: `v1,${flipped}` }).ok, false);
});
