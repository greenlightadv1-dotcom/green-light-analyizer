import { strict as assert } from "node:assert";
import { test } from "node:test";

import { maskSensitiveData } from "./mask.ts";

/**
 * §6.1 masking utility. This is the function standing between a creator's
 * phone number and a company's screen, so it gets tested directly rather than
 * only through the chat flow.
 *
 *   node --experimental-strip-types --test src/lib/*.test.ts src/lib/ai/*.test.ts
 */

test("passes clean text through untouched", () => {
  const text = "Happy to do a dedicated video for $1,200. Can we talk timing?";
  const r = maskSensitiveData(text);
  assert.equal(r.isMasked, false);
  assert.equal(r.maskedText, text);
  assert.deepEqual(r.matched, []);
});

test("strips email addresses", () => {
  const r = maskSensitiveData("Reach me on brand.deals@gmail.com instead");
  assert.equal(r.isMasked, true);
  assert.ok(r.matched.includes("email"));
  assert.ok(!r.maskedText.includes("brand.deals@gmail.com"));
  assert.ok(r.maskedText.includes("[locked: email hidden by platform policy]"));
});

test("strips Egyptian mobile numbers — the MENA pattern §6.1 keeps", () => {
  for (const number of ["01012345678", "01123456789", "01234567890", "01551234567"]) {
    const r = maskSensitiveData(`call me on ${number}`);
    assert.equal(r.isMasked, true, `${number} should be masked`);
    assert.ok(!r.maskedText.includes(number), `${number} leaked`);
  }
});

test("strips international phone formats", () => {
  for (const number of ["+1 415 555 2671", "(415) 555-2671", "415.555.2671"]) {
    const r = maskSensitiveData(`ring ${number} any time`);
    assert.equal(r.isMasked, true, `${number} should be masked`);
  }
});

test("strips off-platform messaging links", () => {
  for (const link of [
    "wa.me/201012345678",
    "t.me/somecreator",
    "discord.gg/abc123",
    "telegram/creatorhandle",
  ]) {
    const r = maskSensitiveData(`move this to ${link}`);
    assert.equal(r.isMasked, true, `${link} should be masked`);
    assert.ok(!r.maskedText.includes(link), `${link} leaked`);
    assert.ok(r.matched.includes("social"));
  }
});

test("reports every rule that fired, not just the first", () => {
  const r = maskSensitiveData(
    "email me at a@b.com or 01012345678, or wa.me/201012345678",
  );
  assert.deepEqual([...r.matched].sort(), ["email", "phone", "social"]);
});

test("is stable across repeated calls — no leaked regex lastIndex", () => {
  const text = "contact me at creator@example.com";
  for (let i = 0; i < 5; i++) {
    const r = maskSensitiveData(text);
    assert.equal(r.isMasked, true, `call ${i} regressed`);
    assert.ok(!r.maskedText.includes("creator@example.com"));
  }
});

test("masks every occurrence, not only the first", () => {
  const r = maskSensitiveData("a@b.com and also c@d.com");
  assert.ok(!r.maskedText.includes("a@b.com"));
  assert.ok(!r.maskedText.includes("c@d.com"));
});

test("known limitation: the phone rule matches long digit runs in prose", () => {
  // Documented, not desired. This is exactly why §6/§12's permanent ban is an
  // admin decision on a logged violation rather than an automatic consequence
  // of the regex firing — see supabase/migrations/0006 and
  // src/app/(app)/admin/violations/actions.ts.
  const r = maskSensitiveData("my last 3 videos did 250 000 3000 views");
  assert.equal(r.isMasked, true);
  assert.ok(r.matched.includes("phone"));
});
