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

// ── Overlapping matches ────────────────────────────────────────────────────
// The spec's reference version applied the rules as a .replace() chain
// (email → phone → social), so whichever rule ran first could cut a later
// rule's match short and leave part of it in clear.

const LINK = "[locked: external link hidden]";
const EMAIL = "[locked: email hidden by platform policy]";
const PHONE = "[locked: phone hidden by platform policy]";

test("a WhatsApp link is masked as a link, with no wa.me/ fragment left", () => {
  const r = maskSensitiveData("ping me: wa.me/201012345678 tonight");
  assert.equal(r.maskedText, `ping me: ${LINK} tonight`);
  // Both rules still reach the audit log — it was a link AND a number.
  assert.deepEqual(r.matched, ["phone", "social"]);
});

test("links are not masked by simply running the link rule first", () => {
  // The obvious fix — move social to the front of the chain — leaks here:
  // the link rule takes `whatsapp/0101`, and the `234 5678` left behind is
  // too short to read as a phone number, so it stays in clear.
  const r = maskSensitiveData("whatsapp/0101 234 5678");
  assert.equal(r.maskedText, LINK);
});

test("no fragment of an overlapping contact survives", () => {
  for (const [text, leaked] of [
    ["info@discord.gg/abc123", "abc123"], // old chain left `/abc123`
    ["t.me/user@example.com", "example.com"],
    ["555 123 4567890@x.com", "555 123"], // old chain left `555 123`
    ["t.me/discord.gg/abc123", "abc123"], // a link hiding inside a link
    ["whatsapp/0101 234 5678", "5678"],
  ] as const) {
    const r = maskSensitiveData(text);
    assert.ok(!r.maskedText.includes(leaked), `${text} leaked ${leaked}: ${r.maskedText}`);
    assert.ok(!r.maskedText.includes("/"), `${text} left a link fragment: ${r.maskedText}`);
  }
});

test("an email that happens to contain a phone number still reads as an email", () => {
  assert.equal(maskSensitiveData("ahmed01012345678@gmail.com").maskedText, EMAIL);
});

test("separate contacts keep separate labels", () => {
  assert.equal(
    maskSensitiveData("a@b.com, 01012345678, t.me/brand").maskedText,
    `${EMAIL}, ${PHONE}, ${LINK}`,
  );
});

// The old behaviour, kept only as a test oracle. Any order of the chain is
// "a way the reference implementation could have been written".
function chained(text: string, order: readonly ("email" | "phone" | "social")[]): string {
  const re = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b01[0125]\d{8}\b/g,
    social: /(telegram|wa\.me|whatsapp|discord\.gg|t\.me)\/[a-zA-Z0-9_]+/gi,
  };
  const label = { email: EMAIL, phone: PHONE, social: LINK };
  return order.reduce((s, kind) => s.replace(re[kind], label[kind]), text);
}

const unmasked = (s: string) => s.replaceAll(EMAIL, "").replaceAll(PHONE, "").replaceAll(LINK, "");

test("masks at least as much as any order of the old chain, and is idempotent", () => {
  const orders = [
    ["email", "phone", "social"],
    ["email", "social", "phone"],
    ["phone", "email", "social"],
    ["phone", "social", "email"],
    ["social", "email", "phone"],
    ["social", "phone", "email"],
  ] as const;
  const pieces = [
    "wa.me/", "WA.ME/", "t.me/", "whatsapp/", "telegram/", "discord.gg/", "@", ".", " ", "-",
    "(", ")", "+", "_", "/", "0101", "010", "20", "234", "5678", "1", "user", "x", ".com", "abc",
  ];
  let seed = 7; // fixed, so a failure reproduces
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < 4000; i++) {
    let text = "";
    for (let n = 1 + Math.floor(next() * 12); n > 0; n--) {
      text += pieces[Math.floor(next() * pieces.length)];
    }
    const out = maskSensitiveData(text).maskedText;
    assert.equal(maskSensitiveData(out).isMasked, false, `not idempotent: ${JSON.stringify(text)}`);
    for (const order of orders) {
      assert.ok(
        unmasked(out).length <= unmasked(chained(text, order)).length,
        `${JSON.stringify(text)} masks less than ${order.join(">")}: ${JSON.stringify(out)}`,
      );
    }
  }
});
