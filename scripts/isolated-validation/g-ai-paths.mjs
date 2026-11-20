// Isolated stack only. Every AI path of /api/g, through the real route, with
// NVIDIA replaced by the scripted fake in mock-externals.mjs.
//
//   App started with NVIDIA_API_KEY=<any dummy> and MOCK_NVIDIA=<mode file>.
//   DB_URL=... MOCK_NVIDIA=<same file> MOCK_OUTBOX=<outbox> APP_URL=http://127.0.0.1:3200 \
//     node scripts/isolated-validation/g-ai-paths.mjs
//
// Uses the ux-* accounts from the README. Clears g_chat rate-limit rows for
// those accounts before and after.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const MODE = process.env.MOCK_NVIDIA;
const OUTBOX = process.env.MOCK_OUTBOX;
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q}"`, { encoding: "utf8" }).trim();
const setMode = (m) => writeFileSync(MODE, m);
const nvidiaCalls = () => readFileSync(OUTBOX, "utf8").split("\n").filter((l) => l.includes("integrate.api.nvidia.com")).length;
const resetLimits = () => sql("delete from rate_limits where key like 'g_chat%'");

let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);

const browser = await chromium.launch();
async function session(email, password) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  return {
    ctx,
    ask: (message, extra = {}) =>
      p.evaluate(async (body) => {
        const t0 = Date.now();
        const r = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, ms: Date.now() - t0, body: await r.json().catch(() => null) };
      }, { message, history: [], locale: "en", page: "/dashboard", ...extra }),
  };
}

try {
  resetLimits();
  const creator = await session("ux-creator@example.invalid", "Ux-Creator-1234!");
  const company = await session("ux-company@example.invalid", "Ux-Company-1234!");
  const admin = await session("ux-admin@example.invalid", "Ux-Admin-1234!");

  // --- signed out -----------------------------------------------------------
  const anon = await browser.newContext();
  const ar = await anon.request.post(`${BASE}/api/g`, { data: { message: "hi", history: [], locale: "en", page: "/" }, maxRedirects: 0 });
  assert.ok(ar.status() === 401 || (ar.status() === 307 && (ar.headers().location ?? "").startsWith("/login")), `status ${ar.status()}`);
  assert.ok(!(await ar.text()).includes("engine"), "no G payload");
  ok(`signed out: /api/g never runs (${ar.status()} to sign-in)`);

  // --- AI answering ----------------------------------------------------------
  setMode("ok");
  let r = await creator.ask("How is my channel performing?");
  assert.equal(r.status, 200);
  assert.equal(r.body.engine, "ai");
  assert.match(r.body.reply, /^Mock G reply\./);
  assert.deepEqual(r.body.actions, [{ action: "open_media_kit" }]);
  assert.equal(r.body.proposals.length, 1);
  assert.equal(r.body.proposals[0].type, "content_draft");
  assert.ok(r.body.cards.assessment, "rule cards still accompany an AI reply");
  ok("AI up (en): reply, an allowed action and a prepared draft, alongside the computed cards");

  r = await creator.ask("ما أداء قناتي؟", { locale: "ar" });
  assert.equal(r.body.engine, "ai");
  assert.match(r.body.reply, /رد تجريبي من G/);
  ok("AI up (ar): an Arabic message gets the Arabic reply");

  r = await creator.ask("And what should I fix first?", {
    history: [
      { role: "user", text: "How is my channel doing? Call me on 01012345678" },
      { role: "assistant", text: "Here is your assessment." },
    ],
  });
  assert.match(r.body.reply, /Your previous question was: "How is my channel doing\? Call me on \[locked: phone hidden by platform policy\]"/);
  ok("context across turns: the previous turn reaches the model, with contact details masked first");

  // --- invalid model output -> rules -------------------------------------------
  for (const mode of ["invalid", "incomplete", "ungrounded"]) {
    setMode(mode);
    r = await creator.ask("How is my channel performing?");
    assert.equal(r.status, 200, mode);
    assert.equal(r.body.engine, "rules", mode);
    assert.equal(r.body.reply, null, mode);
    assert.ok(r.body.cards.assessment, `${mode}: cards still answer`);
    assert.ok(!JSON.stringify(r.body).includes("937"), `${mode}: no invented figure reaches the user`);
  }
  ok("invalid, incomplete and ungrounded model output are discarded; the computed cards answer instead");

  // --- provider errors -> rules --------------------------------------------------
  for (const mode of ["500", "429"]) {
    setMode(mode);
    const before = nvidiaCalls();
    r = await creator.ask("How is my channel performing?");
    assert.equal(r.status, 200, mode);
    assert.equal(r.body.engine, "rules", mode);
    assert.ok(nvidiaCalls() - before >= 1, `${mode}: NVIDIA was actually called`);
  }
  ok("NVIDIA 500 and 429: G answers with rules, within the request");

  setMode("slow");
  r = await creator.ask("How is my channel performing?");
  assert.equal(r.body.engine, "rules");
  assert.ok(r.ms < 40_000, `slow provider bounded by the 25s budget (${r.ms} ms)`);
  ok(`NVIDIA hanging: the call is abandoned at the budget and rules answer (${Math.round(r.ms / 1000)}s)`);

  // --- hostile model output -------------------------------------------------------
  setMode("hostile");
  r = await creator.ask("What should I do next?");
  assert.deepEqual(r.body.actions, [{ action: "open_dashboard" }]);
  assert.deepEqual(r.body.proposals.filter((p) => p.type !== "content_draft"), [], "foreign message draft and a creator brief_draft are dropped");
  r = await company.ask("Recommend creators for my campaign");
  assert.deepEqual(r.body.actions, [{ action: "open_dashboard" }]);
  assert.ok(!r.body.proposals.some((p) => p.creator_id === "99999999-9999-4999-8999-999999999999" || p.type === "content_draft"));
  ok("hostile model output: foreign ids, unknown actions and another role's proposal types are filtered on the server");

  // --- admin ------------------------------------------------------------------
  setMode("ok");
  r = await admin.ask("Summarize Layla's deals");
  assert.deepEqual(r.body.cards, {});
  assert.deepEqual(r.body.proposals, []);
  ok("admin: no cards and no proposals, even when the model offers one");

  // --- company: brief, invited marker, opportunities ---------------------------------
  setMode("down");
  r = await company.ask("We need gaming creators on YouTube in Egypt for a new brief, budget up to 3000");
  const draft = r.body.proposals.find((p) => p.type === "brief_draft");
  assert.ok(draft, "brief draft prepared");
  assert.deepEqual([draft.platforms, draft.categories, draft.target_countries, draft.budget_max_usd], [["youtube"], ["gaming"], ["EG"], 3000]);
  const layla = r.body.cards.recommendations.items.find((i) => i.full_name === "Layla Hassan");
  const invitedTitles = sql("select coalesce(string_agg(b.title, '|' order by b.title), '') from invitations i join briefs b on b.id=i.brief_id join profiles p on p.id=i.creator_id where p.primary_email='ux-creator@example.invalid' and i.company_id=(select id from profiles where primary_email='ux-company@example.invalid') and i.status <> 'withdrawn'");
  const invited = invitedTitles ? invitedTitles.split("|") : [];
  assert.deepEqual([...(layla?.invitedTo ?? [])].sort(), [...invited].sort(), "already-invited marker equals the database");
  ok(`company, AI down: a draft brief from its own words; Layla's already-invited marker equals the database (${invited.length} brief(s))`);

  r = await creator.ask("Which opportunities fit me?");
  const opp = r.body.cards.opportunities.items.find((o) => o.title === "Ramadan launch");
  assert.ok(opp, "the matching published brief is listed");
  assert.deepEqual(opp.matched.map((m) => m.kind).sort(), ["category", "country", "platform"]);
  ok("creator: published briefs matched to the creator's own categories, platforms and audience countries");

  // --- rate limit -----------------------------------------------------------
  // Fill the hourly window to its limit (60) as if spent, then ask once more.
  sql("insert into rate_limits (key, window_started_at, request_count) select 'g_chat:3600:' || id, now(), 60 from profiles where primary_email='ux-creator@example.invalid' on conflict (key) do update set request_count = 60, window_started_at = now()");
  const before = nvidiaCalls();
  r = await creator.ask("How is my channel performing?");
  assert.equal(nvidiaCalls(), before, "no model call once limited");
  assert.equal(r.status, 429);
  assert.equal(r.body.error, "rate_limited");
  ok("rate limit: past the hourly limit, /api/g answers 429 without calling anything");
} finally {
  resetLimits();
  setMode("down");
  await browser.close();
}
console.log(`\n${n} checks passed`);
