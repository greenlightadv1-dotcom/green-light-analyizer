// Isolated stack only (ux-* accounts, see README). Company comparison and
// deliverable review, end to end in a browser, with the AI down (rules).
//
// Seeds a fresh collaboration through the same SECURITY DEFINER functions the
// app calls (brief -> invitation -> accept -> terms -> both confirm -> two
// deliverables -> creator submits both), then checks:
//   - G shows each side the right next step and the agreed amount from the DB;
//   - the review buttons need confirmation; Cancel changes nothing;
//   - approving changes exactly one deliverable, once;
//   - the creator's session replaying the company's review request changes
//     nothing, while the company's own replay against the other deliverable
//     does (positive control);
//   - comparison: two creators from the directory, figures equal to the DB,
//     provenance badges, a foreign id ignored, and the "need two" empty state.
//
//   DB_URL=... APP_URL=http://127.0.0.1:3200 node scripts/isolated-validation/g-collab-compare.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -v ON_ERROR_STOP=1`, { input: q, encoding: "utf8" }).trim();
const CREATOR = sql("select id from profiles where primary_email='ux-creator@example.invalid'");
const COMPANY = sql("select id from profiles where primary_email='ux-company@example.invalid'");
const run = Date.now().toString(36);
const TITLE = `Review test ${run}`;

let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);

// ---------------- seed ----------------
sql("delete from rate_limits where key like 'g_chat%' or key like 'collab_write%'");
const briefId = sql(`insert into briefs (company_id, title, description, platforms, categories, status, published_at)
  values ('${COMPANY}', '${TITLE}', 'Deliverable review end-to-end test brief', '{youtube}', '{gaming}', 'published', now()) returning id`);
const inv = sql(`select public.collab_create_invitation('${COMPANY}', '${briefId}', '${CREATOR}', 'Join our test campaign', 1500)`);
const collab = sql(`select public.collab_respond_invitation('${CREATOR}', '${inv}', 'accept', null)`);
sql(`select public.collab_propose_terms('${COMPANY}', '${collab}', 1500, 'One integration video and one story, delivered within two weeks.')`);
sql(`select public.collab_confirm_terms('${CREATOR}', '${collab}'); select public.collab_confirm_terms('${COMPANY}', '${collab}');`);
const d1 = sql(`select public.collab_add_deliverable('${COMPANY}', '${collab}', 'Integration video', null, null)`);
const d2 = sql(`select public.collab_add_deliverable('${COMPANY}', '${collab}', 'Story share', null, null)`);
sql(`select public.collab_submit_deliverable('${CREATOR}', '${d1}', 'https://example.com/video', null); select public.collab_submit_deliverable('${CREATOR}', '${d2}', 'https://example.com/story', null);`);
const status = (d) => sql(`select status from deliverables where id='${d}'`);
const agreed = Number(sql(`select agreed_amount_usd from collaborations where id='${collab}'`));
assert.equal(status(d1), "submitted");
assert.equal(agreed, 1500);
ok(`seeded collaboration ${collab.slice(0, 8)}: agreed $1,500, two deliverables submitted`);

const browser = await chromium.launch();
async function login(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  await p.waitForLoadState("networkidle");
  return { ctx, p };
}
async function openG(p) {
  if (!(await p.locator("section[role=dialog]").count())) await p.getByRole("button", { name: /Open G/ }).click();
  await p.locator("section[role=dialog]").waitFor();
}
async function ask(p, text) {
  await openG(p);
  const panel = p.locator("section[role=dialog]");
  const before = await panel.locator(".me-4").count();
  await panel.getByRole("textbox", { name: /Ask G/ }).fill(text);
  const answered = p.waitForResponse((r) => r.url().endsWith("/api/g") && r.request().method() === "POST", { timeout: 90_000 });
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  const res = await answered;
  await p.waitForFunction(([sel, k]) => document.querySelectorAll(sel).length > k, ["section[role=dialog] .me-4", before]);
  await p.waitForTimeout(300);
  return { el: panel.locator(".me-4").last(), body: await res.json() };
}
function capture(p) {
  return new Promise((resolve) => {
    const on = (req) => {
      if (req.method() === "POST" && req.headers()["next-action"]) {
        p.off("request", on);
        resolve({ url: req.url(), headers: req.headers(), body: req.postDataBuffer() });
      }
    };
    p.on("request", on);
  });
}
async function replay(ctx, c, body = c.body) {
  const headers = Object.fromEntries(Object.entries(c.headers).filter(([k]) => !["cookie", "content-length", "host"].includes(k)));
  return (await ctx.request.post(c.url, { headers, data: body, maxRedirects: 0 })).status();
}

try {
  const co = await login("ux-company@example.invalid", "Ux-Company-1234!");
  const cr = await login("ux-creator@example.invalid", "Ux-Creator-1234!");

  // ---------------- G sees the right state on each side ----------------
  let r = await ask(co.p, "What is the status of my collaborations?");
  const mine = r.body.cards.collaborations.items.find((c) => c.id === collab);
  assert.ok(mine, "the collaboration is in the company's card");
  assert.equal(mine.next, "review_work");
  assert.equal(mine.agreed_amount_usd, agreed);
  assert.deepEqual([mine.deliverables.submitted, mine.deliverables.approved], [2, 0]);
  assert.match(await r.el.innerText(), new RegExp(`${TITLE}[\\s\\S]*Next: review the submitted work\\.`));
  ok("company G: next step 'review the submitted work', $1,500 and 2 submitted, all from the database");

  r = await ask(cr.p, "What is the status of my collaborations?");
  const theirs = r.body.cards.collaborations.items.find((c) => c.id === collab);
  assert.equal(theirs.next, "wait_for_review");
  assert.match(await r.el.innerText(), /Waiting for the company's review\./);
  const checkIn = r.body.proposals.find((p) => p.type === "message_draft" && p.collaboration_id === collab);
  assert.ok(checkIn, "creator gets a copy-only check-in draft while waiting");
  assert.equal(await r.el.locator("form").count(), 0, "a message draft is copy-only: no form, nothing to submit");
  ok("creator G: 'waiting for the company's review', plus a copy-only check-in draft (nothing is sent)");

  // ---------------- deliverable review on the collaboration page ----------------
  await co.p.goto(`${BASE}/collaborations/${collab}`, { waitUntil: "networkidle" });
  const approveButtons = co.p.getByRole("button", { name: "Approve", exact: true });
  assert.equal(await approveButtons.count(), 2);
  await approveButtons.first().click();
  await co.p.locator("dialog[open]").waitFor();
  await co.p.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  await co.p.waitForTimeout(500);
  assert.deepEqual([status(d1), status(d2)], ["submitted", "submitted"]);
  ok("review: Cancel on the approval dialog changes nothing");

  const reviewReq = capture(co.p);
  await approveButtons.first().click();
  await co.p.locator("dialog[open]").waitFor();
  await co.p.locator("dialog[open]").getByRole("button", { name: /Approve/ }).last().click();
  const reviewCall = await reviewReq;
  await co.p.waitForTimeout(2500);
  const approved = [d1, d2].filter((d) => status(d) === "approved");
  assert.equal(approved.length, 1, "exactly one deliverable approved");
  const other = approved[0] === d1 ? d2 : d1;
  ok("review: confirming approves exactly one deliverable");

  const body = reviewCall.body.toString("latin1");
  assert.ok(body.includes(approved[0]), "the captured request names the approved deliverable");
  const otherBody = Buffer.from(body.replaceAll(approved[0], other), "latin1");
  const asCreator = await replay(cr.ctx, reviewCall, otherBody);
  assert.equal(status(other), "submitted", `creator replay (${asCreator})`);
  ok(`permissions: the company's review request replayed by the creator against the other deliverable changes nothing (${asCreator})`);
  await replay(co.ctx, reviewCall, otherBody);
  assert.equal(status(other), "approved", "positive control");
  ok("control: the company's own replay approves the other deliverable, so the refusal above was the server's");

  r = await ask(co.p, "What is the status of my collaborations?");
  const after = r.body.cards.collaborations.items.find((c) => c.id === collab);
  assert.equal(after.next, "complete");
  assert.equal(after.deliverables.approved, 2);
  ok("company G: after both approvals the next step is 'mark it completed', read back from the database");

  // ---------------- comparison ----------------
  await co.p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  r = await ask(co.p, "Compare creators");
  assert.equal(r.body.cards.comparison, undefined);
  assert.equal(r.body.cards.comparisonNeeds.selected, 0);
  assert.match(await r.el.innerText(), /Add at least two creators to the comparison first \(selected: 0\)/);
  ok("comparison empty state: with nothing selected G says two are needed instead of answering with nothing");

  // Only one isolated creator has a media kit, so G recommends one; Discover's
  // "Add to comparison" feeds the same tray for the second.
  r = await ask(co.p, "Recommend creators for my campaign");
  await r.el.getByRole("button", { name: "Add to comparison" }).first().click();
  await co.p.goto(`${BASE}/discover`, { waitUntil: "networkidle" });
  const adds = co.p.locator("main").getByRole("button", { name: /Add to comparison/ });
  assert.ok((await adds.count()) >= 2, "Discover lists at least two creators");
  for (let i = 0; i < (await adds.count()) && i < 3; i++) await adds.nth(i).click();
  await openG(co.p);
  const panel = co.p.locator("section[role=dialog]");
  await panel.getByRole("button", { name: /Compare/ }).last().click();
  await co.p.waitForResponse((res) => res.url().endsWith("/api/g"));
  await co.p.waitForTimeout(800);
  const card = panel.locator(".me-4").last();
  const text = await card.innerText();
  assert.match(text, /Layla Hassan/);
  const kit = sql(`select avg_views || '|' || engagement_rate from media_kits where creator_id='${CREATOR}' and platform='youtube'`).split("|");
  assert.match(text, new RegExp(Number(kit[0]).toLocaleString("en-US")));
  assert.match(text, new RegExp(String(Number(kit[1]))));
  assert.match(text, /SELF-REPORTED|Self-reported/i);
  assert.match(text, /VERIFIED|Verified/i);
  ok(`comparison: two directory creators side by side; Layla's ${Number(kit[0]).toLocaleString("en-US")} views and ${Number(kit[1])}% engagement match the database, with provenance`);

  const foreign = await co.p.evaluate(async (ids) => {
    const res = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "compare", history: [], locale: "en", page: "/dashboard", compare: ids }) });
    return res.json();
  }, ["99999999-9999-4999-8999-999999999999", CREATOR]);
  assert.equal(foreign.cards.comparison, undefined);
  assert.equal(foreign.cards.comparisonNeeds.selected, 1, "the foreign id does not count");
  ok("comparison: an id outside the directory is ignored (only 1 valid of 2)");

  const asCreatorCompare = await cr.p.evaluate(async (ids) => {
    const res = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "compare these creators", history: [], locale: "en", page: "/dashboard", compare: ids }) });
    return res.json();
  }, [CREATOR, COMPANY]);
  assert.ok(!asCreatorCompare.cards.comparison && !asCreatorCompare.cards.comparisonNeeds && !asCreatorCompare.cards.recommendations);
  ok("permissions: a creator asking to compare gets no comparison or directory data");
} finally {
  sql("delete from rate_limits where key like 'g_chat%' or key like 'collab_write%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);
