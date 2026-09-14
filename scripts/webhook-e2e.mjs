#!/usr/bin/env node
/**
 * End-to-end test for the inbound-email webhook (§5.3).
 *
 * Drives the real HTTP endpoint on a running server with real Svix signatures.
 * The unit tests in src/lib/email/verify.test.ts prove the signing maths; this
 * proves the deployed route actually enforces it — which is a different claim,
 * and one this suite has already caught being false once: the auth proxy was
 * redirecting /api/webhooks/* to /login, so every delivery got a cheerful 200
 * for a message that was never processed. Hence `redirect: "manual"` below;
 * a followed redirect turns silent data loss into an apparent success.
 *
 *   npm run build && npm run start -- -p 3666 &
 *   node scripts/webhook-e2e.mjs
 *
 * Env: WEBHOOK_URL, RESEND_INBOUND_WEBHOOK_SECRET.
 *
 * With SUPABASE_SERVICE_ROLE_KEY unset, a valid delivery reaches the intake and
 * fails there — case 7 asserts only that it got past the signature gate, which
 * is what this file is about.
 */
import { createHmac } from "node:crypto";

const URL_ =
  process.env.WEBHOOK_URL ?? "http://127.0.0.1:3666/api/webhooks/resend";
// Fallback is a test fixture of the right shape, not a credential. Point this
// at a real environment only via RESEND_INBOUND_WEBHOOK_SECRET.
const SECRET =
  process.env.RESEND_INBOUND_WEBHOOK_SECRET ??
  "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function sign(id, timestamp, body, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

const payload = {
  type: "email.received",
  data: {
    message_id: "msg_e2e_1",
    from: "Brand Team <deals@brand.com>",
    to: ["creator@gmail.com", "amir.k3f9x2@analyze.greenlight.com"],
    subject: "Sponsorship: dedicated video",
    text: "Hi! We can pay $500 for a dedicated video. Reach me on 01012345678 or wa.me/201012345678.",
  },
};
const body = JSON.stringify(payload);

async function post(headers, b = body) {
  const res = await fetch(URL_, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", ...headers },
    body: b,
  });
  return res.status;
}

const results = [];
const check = (name, expected, got) =>
  results.push({ name, expected, got, verdict: expected === got ? "PASS" : "*** FAIL ***" });

const ts = Math.floor(Date.now() / 1000).toString();

check("unsigned POST is refused", 401, await post({}));

check("bogus signature is refused", 401, await post({
  "svix-id": "msg_e2e_1", "svix-timestamp": ts,
  "svix-signature": "v1,bm90YXNpZ25hdHVyZQ==",
}));

// A genuine signature over the original body, sent with a swapped-in sender.
check("tampered body is refused", 401, await post(
  { "svix-id": "msg_e2e_1", "svix-timestamp": ts, "svix-signature": `v1,${sign("msg_e2e_1", ts, body)}` },
  JSON.stringify({ ...payload, data: { ...payload.data, from: "attacker@evil.com" } }),
));

const oldTs = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
check("replayed delivery is refused", 401, await post({
  "svix-id": "msg_e2e_1", "svix-timestamp": oldTs,
  "svix-signature": `v1,${sign("msg_e2e_1", oldTs, body)}`,
}));

check("wrong secret is refused", 401, await post({
  "svix-id": "msg_e2e_1", "svix-timestamp": ts,
  "svix-signature": `v1,${sign("msg_e2e_1", ts, body, "whsec_AAAAAAAAAAAAAAAAAAAAAAAA")}`,
}));

check("GET is refused", 405, (await fetch(URL_, { redirect: "manual" })).status);

const validStatus = await post({
  "svix-id": "msg_e2e_1", "svix-timestamp": ts,
  "svix-signature": `v1,${sign("msg_e2e_1", ts, body)}`,
});
check(
  "valid signature passes the gate (reaches intake)",
  true,
  validStatus !== 401 && validStatus !== 405 && validStatus !== 307,
);

const badJson = "{not json";
const badTs = Math.floor(Date.now() / 1000).toString();
check("signed but malformed JSON is a 400", 400, await post(
  { "svix-id": "msg_bad", "svix-timestamp": badTs, "svix-signature": `v1,${sign("msg_bad", badTs, badJson)}` },
  badJson,
));

console.log("\n  #  verdict        expected  got   test");
results.forEach((r, i) =>
  console.log(
    `  ${String(i + 1).padStart(2)} ${r.verdict.padEnd(14)} ${String(r.expected).padEnd(9)} ${String(r.got).padEnd(5)} ${r.name}`,
  ),
);
const failed = results.filter((r) => r.verdict !== "PASS").length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
