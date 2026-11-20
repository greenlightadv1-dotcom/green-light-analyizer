// Isolated stack only. G's brief recommendations for creators (Phase 1D),
// through the real /api/g route and panel, with the AI DOWN (rules only).
// This proves which briefs are recommended and why; it says nothing about a
// real model's explanation of them.
//
//   DB_URL=... APP_URL=http://localhost:3200 node scripts/isolated-validation/g-creator-recs.mjs
//
// Seeds four ux-company briefs and one declined invitation, sets ux-creator's
// base rate for the run, and restores everything afterwards.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/(["$`\\])/g, "\\$1")}"`, { encoding: "utf8" }).trim();
const first = (q) => sql(q).split("\n")[0];
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);

const creator = first("select id from profiles where primary_email='ux-creator@example.invalid'");
const company = first("select id from profiles where primary_email='ux-company@example.invalid'");
const rate = first(`select coalesce(base_rate_usd::text, 'null') from profiles where id='${creator}'`);
const seeded = [];
const brief = (title, status, extra) => {
  const id = first(`insert into briefs (company_id, title, description, status, platforms, categories, target_countries, budget_max_usd, due_date, published_at) values ('${company}', '${title}', 'Synthetic brief for the G recommendation check.', '${status}', '{youtube}', '{tech,gaming}', '{EG}', ${extra.budget ?? "null"}, ${extra.due ? `'${extra.due}'` : "null"}, ${status === "published" ? "now()" : "null"}) returning id`);
  seeded.push(id);
  return id;
};
const browser = await chromium.launch();
try {
  sql("delete from rate_limits where key like 'g_chat%'");
  sql(`update profiles set base_rate_usd = 800 where id='${creator}'`);
  const fit = brief("G rec fit", "published", { budget: 1000, due: "2099-12-31" });
  const low = brief("G rec low budget", "published", { budget: 500 });
  const expired = brief("G rec expired", "published", { due: "2020-01-01" });
  const declined = brief("G rec declined", "published", {});
  const draft = brief("G rec draft", "draft", {});
  sql(`insert into invitations (brief_id, company_id, creator_id, message, status, responded_at) values ('${declined}', '${company}', '${creator}', 'Synthetic invitation', 'declined', now())`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', "ux-creator@example.invalid");
  await p.fill('input[name="password"]', "Ux-Creator-1234!");
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  const ask = (message, locale = "en") => p.evaluate(async (body) => {
    const r = await fetch("/api/g", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }, { message, history: [], locale, page: "/dashboard" });

  let r = await ask("Which briefs fit me?");
  assert.equal(r.engine, "rules");
  const items = r.cards.opportunities.items;
  const ids = items.map((o) => o.brief_id);
  assert.ok(ids.includes(fit) && ids.includes(low), "the two open seeded briefs are recommended");
  for (const [name, id] of [["expired", expired], ["declined", declined], ["draft", draft]]) assert.ok(!ids.includes(id), `the ${name} brief is not recommended`);
  ok("“Which briefs fit me?”: open matching briefs are recommended; expired, declined and draft briefs are not");

  const f = items.find((o) => o.brief_id === fit);
  const l = items.find((o) => o.brief_id === low);
  assert.deepEqual(f.matched.map((m) => m.kind).sort(), ["category", "country", "platform"]);
  assert.deepEqual(f.matched.find((m) => m.kind === "country").values, ["EG"], "the country comes from the creator's own audience data");
  assert.equal(f.budget_fit, "within");
  assert.equal(l.budget_fit, "below_your_rate");
  assert.equal(f.invitation_status, null);
  const pending = items.find((o) => o.invitation_status === "pending");
  if (pending) assert.equal(pending.invited, true);
  assert.ok(!items.some((o) => o.invitation_status === "accepted"), "a brief already accepted (a collaboration) is not recommended again");
  ok("each match states its reasons (category, platform, audience country), the budget against the creator's own base rate, and the invitation status");

  r = await ask("ما الحملات المناسبة لي؟", "ar");
  assert.ok(r.cards.opportunities.items.some((o) => o.brief_id === fit), "Arabic: the same recommendations");
  ok("an Arabic question gets the same grounded recommendations");

  // The panel: the explanation, the link to the original brief, and no application button.
  sql("delete from rate_limits where key like 'g_chat%'");
  await p.getByRole("button", { name: /Open G/ }).click();
  const panel = p.locator("section[role=dialog]");
  await panel.getByRole("textbox", { name: /Ask G/ }).fill("Which briefs fit me?");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  const how = panel.getByTestId("g-opp-how");
  await how.waitFor({ timeout: 60000 });
  assert.match(await how.innerText(), /You can't apply to a brief on Green Light yet/);
  assert.equal(await panel.getByRole("button", { name: /apply/i }).count(), 0, "no application button anywhere in the panel");
  const view = panel.locator(`a[href$="/opportunities#brief-${fit}"]`);
  await view.waitFor();
  await view.click();
  await p.waitForURL(new RegExp(`/opportunities#brief-${fit}$`));
  await p.locator(`#brief-${fit}`).getByText("G rec fit").waitFor();
  ok("the panel explains that companies invite (no application feature), and “View the brief” opens the original brief in Opportunities");
} finally {
  sql(`delete from invitations where brief_id in (${seeded.map((s) => `'${s}'`).join(",") || "null"})`);
  for (const id of seeded) sql(`delete from briefs where id='${id}'`);
  sql(`update profiles set base_rate_usd = ${rate} where id='${creator}'`);
  sql("delete from rate_limits where key like 'g_chat%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);
