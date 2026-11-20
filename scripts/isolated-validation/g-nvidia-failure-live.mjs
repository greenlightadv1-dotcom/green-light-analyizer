// Isolated stack only. G against the REAL NVIDIA endpoint, with NO valid key:
// proves that real provider failures (not a scripted fake) end in the safe
// rules fallback, and that the failure is logged without the key.
//
// The app must run with MOCK_NVIDIA pointing at a file containing "live",
// NVIDIA_API_KEY set to an obviously fake placeholder (never a real key), and
// its server log written to APP_LOG. Run once per expectation:
//
//   EXPECT=410  (NVIDIA_MODEL unset: the retired code default)
//   EXPECT=403  (NVIDIA_MODEL set to a model that IS in the public catalog; NVIDIA
//                answers an invalid Bearer key with 403 "Authorization failed")
//
//   DB_URL=... APP_URL=http://localhost:3200 APP_LOG=<app log> FAKE_KEY=<placeholder> EXPECT=410 \
//     node scripts/isolated-validation/g-nvidia-failure-live.mjs
//
// Data sent to NVIDIA: the throwaway ux-creator account's synthetic profile.
// NVIDIA rejects the request before running the model (410/401).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const { APP_LOG, FAKE_KEY, EXPECT } = process.env;
assert.ok(APP_LOG && FAKE_KEY && ["410", "403"].includes(EXPECT ?? ""), "APP_LOG, FAKE_KEY and EXPECT=410|403 are required");
execSync(`psql "$DB_URL" -XqAt -c "delete from rate_limits where key like 'g_chat%'"`);

let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const logStart = readFileSync(APP_LOG, "utf8").length;
const events = () =>
  readFileSync(APP_LOG, "utf8").slice(logStart).split("\n").flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });

const browser = await chromium.launch();
try {
  const p = await (await browser.newContext()).newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', "ux-creator@example.invalid");
  await p.fill('input[name="password"]', "Ux-Creator-1234!");
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  const ask = (message, locale) => p.evaluate(async (body) => {
    const t0 = Date.now();
    const r = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, ms: Date.now() - t0, body: await r.json() };
  }, { message, history: [], locale, page: "/dashboard" });

  const en = await ask("How is my channel performing?", "en");
  const ar = await ask("كيف أداء قناتي؟", "ar");
  for (const [label, r] of [["en", en], ["ar", ar]]) {
    console.log(`   ${label}: HTTP ${r.status} engine=${r.body.engine} ${r.ms}ms`);
    assert.equal(r.status, 200);
    assert.equal(r.body.engine, "rules", "a real provider failure must end in the rules fallback");
    // Rules mode answers with computed cards and no model prose, by design.
    assert.ok(r.body.cards && Object.keys(r.body.cards).length > 0, "the fallback still answers with computed cards");
    assert.equal(r.body.reply, null, "no prose is presented as if the model had written it");
  }
  ok(`the real NVIDIA endpoint failed and G answered from rules, in English and Arabic (engine=rules, HTTP 200)`);

  await new Promise((r) => setTimeout(r, 500));
  const ev = events();
  const attempts = ev.filter((e) => e.event === "nvidia.attempt_failed");
  const unavailable = ev.filter((e) => e.event === "nvidia.unavailable");
  assert.ok(attempts.length >= 2, "both requests reached NVIDIA");
  assert.ok(attempts.every((e) => e.status === Number(EXPECT)), `NVIDIA answered ${EXPECT}: ${attempts.map((e) => e.status)}`);
  assert.ok(unavailable.length >= 2 && unavailable.every((e) => e.stopped === "terminal_status" && e.attempts === 1),
    "a terminal status stops after one attempt (no retry wasted)");
  ok(`NVIDIA answered HTTP ${EXPECT}; each call stopped after one attempt (terminal_status)`);

  if (EXPECT === "410") {
    const m = ev.filter((e) => e.event === "nvidia.model_unavailable");
    assert.ok(m.length >= 1 && m.every((e) => e.status === 410 && /end of life/i.test(e.reason)), "the retirement is named in the log");
    ok("the retired model is logged as nvidia.model_unavailable with NVIDIA's end-of-life reason");
  } else {
    assert.ok(ev.some((e) => e.event === "nvidia.credential_rejected"), "a rejected key is diagnosed");
    ok("the rejected key is logged as nvidia.credential_rejected");
  }

  const raw = readFileSync(APP_LOG, "utf8").slice(logStart);
  assert.ok(!raw.includes(FAKE_KEY), "the key value never appears in the log");
  ok("the key value appears nowhere in the server log");
} finally {
  await browser.close();
}
console.log(`\n${n} checks passed`);
