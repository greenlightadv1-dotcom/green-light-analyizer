// Isolated stack only. Seed with the ux-* accounts (see README), then:
//   DB_URL=... APP_URL=http://127.0.0.1:3200 node scripts/isolated-validation/g-workflows.mjs <screenshot-dir>
// NVIDIA must be unreachable (mock-externals answers 503), so this checks the
// rules engine and the deterministic proposals end to end.
// G workflows on the isolated stack (NVIDIA mocked to 503 -> rules + fallback proposals).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = process.argv[2];
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q}"`, { encoding: "utf8" }).trim();
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
async function login(b, email, pw, vp = { width: 1440, height: 900 }) {
  const c = await b.newContext({ viewport: vp });
  const p = await c.newPage();
  await p.goto((process.env.APP_URL ?? "http://127.0.0.1:3200") + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', pw);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  await p.waitForLoadState("networkidle");
  return p;
}
async function ask(p, text) {
  const panel = p.locator("section[role=dialog]");
  const before = await panel.locator(".me-4").count();
  await panel.getByRole("textbox", { name: /Ask G/ }).fill(text);
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.locator(".me-4").nth(before).waitFor({ timeout: 60000 });
  return panel.locator(".me-4").nth(before);
}
(async () => {
  // Start from a known state: no saved drafts, no invitations from this company, no spent limits.
  sql("delete from content_items where creator_id=(select id from profiles where primary_email='ux-creator@example.invalid'); delete from invitations where company_id=(select id from profiles where primary_email='ux-company@example.invalid'); delete from rate_limits where key like 'g_chat%' or key like 'content_write%' or key like 'collab_write%'");
  const b = await chromium.launch();
  // ---------------- creator ----------------
  const p = await login(b, "ux-creator@example.invalid", "Ux-Creator-1234!");
  await p.getByRole("button", { name: /Open G/ }).click();
  const panel = p.locator("section[role=dialog]");
  await panel.waitFor();
  const r1 = await ask(p, "How is my channel performing?");
  const t1 = await r1.innerText();
  assert.match(t1, /could not be reached|rule|AI/i);
  assert.match(t1, /180,000|180K|180000/, "assessment shows the synced subscriber figure");
  ok("creator: channel question answers with rule cards built from the creator's own synced data");
  await p.screenshot({ path: `${OUT}/g_creator_assessment.png` });
  const r2 = await ask(p, "Summarize my deals");
  assert.match(await r2.innerText(), /brand-one|1,500|\$1,500/);
  ok("creator: deals summary lists the creator's own deal rooms");
  const r3 = await ask(p, "Give me video ideas for my content plan");
  const prop = r3.getByRole("button", { name: "Save to my content plan" });
  await prop.waitFor({ timeout: 10000 });
  assert.equal(await r3.locator("input[name=title]").inputValue(), "Isolated test fixture: new Shorts editing tools");
  assert.match(await r3.locator("textarea").inputValue(), /Source: YouTube Official Blog, \d{4}-\d{2}-\d{2}\nhttps:\/\/blog.youtube\/ux-fixture-1/);
  ok("creator: with the AI down, G still prepares a content idea from a stored official headline");
  await p.screenshot({ path: `${OUT}/g_creator_proposal.png` });
  assert.equal(sql("select count(*) from content_items where creator_id=(select id from profiles where primary_email='ux-creator@example.invalid')"), "0");
  await prop.click();
  const dlg = p.locator("dialog[open]");
  await dlg.waitFor();
  ok("creator: saving needs an explicit confirmation dialog; nothing is written before it");
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await r3.getByText("Saved to your content plan.").waitFor({ timeout: 20000 });
  assert.equal(sql("select count(*) from content_items where creator_id=(select id from profiles where primary_email='ux-creator@example.invalid') and status='drafting' and kind='idea'"), "1");
  ok("creator: after confirming, the real server action stored exactly one draft and G reported it");
  // ---------------- company ----------------
  const c = await login(b, "ux-company@example.invalid", "Ux-Company-1234!");
  await c.getByRole("button", { name: /Open G/ }).click();
  await c.locator("section[role=dialog]").waitFor();
  const q1 = await ask(c, "Recommend creators for my campaign");
  const inv = q1.getByRole("button", { name: "Review and send invitation" });
  await inv.waitFor({ timeout: 10000 });
  const txt = await q1.innerText();
  assert.match(txt, /Layla/);
  const published = sql("select string_agg(title, '|') from briefs where status='published' and company_id=(select id from profiles where primary_email='ux-company@example.invalid')").split("|");
  const msg = await q1.locator("textarea").first().inputValue();
  assert.ok(published.some((t) => msg.includes(`"${t}"`)), "the invitation names one of the company's own published briefs");
  assert.doesNotMatch(txt, /ux-creator@example\.invalid|layla\.k7m2/, "no creator contact or alias in G's answer");
  ok("company: G recommends from the directory and prepares an invitation for its own published brief");
  await c.screenshot({ path: `${OUT}/g_company_proposal.png` });
  await inv.click();
  const d2 = c.locator("dialog[open]");
  await d2.waitFor();
  assert.equal(sql("select count(*) from invitations where company_id=(select id from profiles where primary_email='ux-company@example.invalid')"), "0");
  await d2.getByRole("button", { name: "Send", exact: true }).click();
  await q1.getByText("Invitation sent.").waitFor({ timeout: 20000 }).catch(async () => { await c.screenshot({ path: OUT + "/g_company_after_send.png" }); throw new Error("no success message: " + (await q1.innerText()).slice(-300)); });
  assert.equal(sql("select count(*) from invitations where company_id=(select id from profiles where primary_email='ux-company@example.invalid') and status='pending'"), "1");
  ok("company: confirming sends one invitation through the ordinary server action");
  const q2 = await ask(c, "Recommend creators for my campaign");
  assert.equal(await q2.getByRole("button", { name: "Review and send invitation" }).count(), 0);
  ok("company: G does not propose inviting the same creator to the same brief twice");
  // ---------------- admin ----------------
  const a = await login(b, "ux-admin@example.invalid", "Ux-Admin-1234!");
  await a.getByRole("button", { name: /Open G/ }).click();
  await a.locator("section[role=dialog]").waitFor();
  const q3 = await ask(a, "Summarize Layla's deals");
  assert.doesNotMatch(await q3.innerText(), /brand-one|1,500/);
  assert.equal(await q3.locator("form").count(), 0);
  ok("admin: G gives navigation help only, with no other users' data and no prepared actions");
  console.log(`\n${n} checks passed`);
  await b.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
