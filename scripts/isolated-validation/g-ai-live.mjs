// OWNER-RUN, isolated stack only. G against the REAL NVIDIA model.
//
// The app must be running against the isolated stack with a real
// NVIDIA_API_KEY in its environment and MOCK_NVIDIA pointing at a file that
// contains "live" (see docs/G/NVIDIA_LIVE_CHECK.md). This script never reads,
// prints or stores the key. It sends 4 G questions (about 4 to 8 NVIDIA calls,
// with the app's one retry) and prints only engine, timing and pass/fail.
//
//   DB_URL=... APP_URL=http://127.0.0.1:3200 node scripts/isolated-validation/g-ai-live.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
execSync(`psql "$DB_URL" -XqAt -c "delete from rate_limits where key like 'g_chat%'"`);

const ARABIC = /[؀-ۿ]/;
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const browser = await chromium.launch();
async function session(email, password) {
  const p = await (await browser.newContext()).newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  return (message, extra = {}) =>
    p.evaluate(async (body) => {
      const t0 = Date.now();
      const r = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, ms: Date.now() - t0, body: await r.json() };
    }, { message, history: [], locale: "en", page: "/dashboard", ...extra });
}

try {
  const creator = await session("ux-creator@example.invalid", "Ux-Creator-1234!");
  const company = await session("ux-company@example.invalid", "Ux-Company-1234!");

  let r = await creator("How is my channel performing, and what should I improve first?");
  console.log(`   creator en: engine=${r.body.engine} ${r.ms}ms`);
  assert.equal(r.body.engine, "ai", "the real model answered and its reply passed validation and grounding (rules means it did not: see the server log event nvidia.unavailable or g.reply_ungrounded)");
  assert.ok(!ARABIC.test(r.body.reply), "English question, English answer");
  ok("creator, English: the live model answered, grounded in the creator's data");

  r = await creator("ما نقاط القوة والضعف في قناتي؟", { locale: "ar" });
  console.log(`   creator ar: engine=${r.body.engine} ${r.ms}ms`);
  assert.equal(r.body.engine, "ai");
  assert.ok(ARABIC.test(r.body.reply), "Arabic question, Arabic answer");
  ok("creator, Arabic: the live model answered in Arabic");

  r = await creator("Give me one video idea with a hook", {
    history: [{ role: "user", text: "My channel is about gaming" }, { role: "assistant", text: "Noted." }],
  });
  console.log(`   creator idea: engine=${r.body.engine} proposals=${r.body.proposals.map((p) => p.type).join(",") || "none"} ${r.ms}ms`);
  assert.equal(r.body.engine, "ai");
  ok("creator, follow-up with history: answered (any proposal shown passed the server's scope and grounding filters)");

  r = await company("Recommend gaming creators on YouTube in Egypt for my campaign");
  console.log(`   company: engine=${r.body.engine} actions=${r.body.actions.map((a) => a.action).join(",")} ${r.ms}ms`);
  assert.equal(r.body.engine, "ai");
  assert.ok(r.body.cards.recommendations, "the rule-computed recommendations accompany the AI reply");
  ok("company, English: the live model answered alongside the computed recommendations");
} finally {
  execSync(`psql "$DB_URL" -XqAt -c "delete from rate_limits where key like 'g_chat%'"`);
  await browser.close();
}
console.log(`\n${n} checks passed`);
