// P0-1 acceptance: every deal room renders its chat with malformed intelligence data.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { execFileSync } from "node:child_process";
const BASE = "http://localhost:3200", DB = process.env.DB_URL;
const sql = (q) => execFileSync("psql", [DB, "-XqAt", "-c", q]).toString().trim();
const ok = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const browser = await chromium.launch();
async function login(email) { const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/login"); await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', "Test-Pass-12345!"); await p.click('form button[type="submit"]'); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }); return p; }
const rooms = sql("select id||'|'||creator_id||'|'||coalesce(security_check::text,'null')||'|'||coalesce(company_profile::text,'null') from public.deal_chats order by created_at").split("\n");
const owners = { "96475964-f647-4da2-a2d5-0571879c1460": "u-96475964", "373f4eb5-c8f5-4614-b1a3-8e699950eacc": "u-373f4eb5", "6a11ff7e-4673-4676-b4e9-11c0b4911fc4": "u-6a11ff7e" };
const pages = {};
for (const row of rooms) {
  const [id, creator, sc, cp] = row.split("|");
  pages[creator] ??= await login(owners[creator] + "@example.invalid");
  const p = pages[creator];
  await p.goto(BASE + "/inbox/" + id); await p.waitForLoadState("networkidle");
  const composer = await p.$('textarea[name="message_text"]');
  const crashed = (await p.textContent("body")).includes("Try again");
  ok(`room ${id.slice(0, 8)} renders chat (security_check=${sc}, company_profile=${cp})`, !!composer && !crashed);
}
// An extra-hostile shape, written only on the isolated stack: wrong types everywhere.
const id = rooms[0].split("|")[0], creator = rooms[0].split("|")[1];
sql(`update public.deal_chats set security_check = '{"domain":"x.example","reasons":"oops","whois":{"createdAt":5},"safeBrowsing":{"flagged":"yes","threatTypes":7},"trustScore":"high"}'::jsonb, company_profile = '{"signals":null,"confidence":"?"}'::jsonb where id='${id}'`);
const p = pages[creator]; await p.goto(BASE + "/inbox/" + id); await p.waitForLoadState("networkidle");
ok("room with wrong types everywhere still renders chat and the domain", !!(await p.$('textarea[name="message_text"]')) && (await p.textContent("body")).includes("x.example"));
// A valid record still shows its reasons and score (unchanged behaviour).
sql(`update public.deal_chats set security_check = '{"domain":"brand.example","reasons":["Domain registered recently"],"safeBrowsing":{"flagged":false,"threatTypes":[]},"trustScore":61,"whois":null}'::jsonb where id='${id}'`);
await p.goto(BASE + "/inbox/" + id); await p.waitForLoadState("networkidle");
const body = await p.textContent("body");
ok("a valid record still shows its reason and score", body.includes("Domain registered recently") && /61\s*%/.test(body));
await browser.close();
