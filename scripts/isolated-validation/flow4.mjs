// Isolated workflow test, part 4: existing users' pages, chat relay, OAuth, no external effects.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const BASE = "http://localhost:3200", DB = process.env.DB_URL, OUT = process.env.MOCK_OUTBOX;
const sql = (q) => execFileSync("psql", [DB, "-XqAt", "-c", q]).toString().trim();
const outbox = () => readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = (name, cond, detail = "") => console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
const browser = await chromium.launch();
async function login(email, pw = "Test-Pass-12345!") {
  const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(BASE + "/login"); await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', pw);
  await p.click('form button[type="submit"]'); await p.waitForTimeout(2500); return p;
}
async function visit(p, path) {
  const r = await p.goto(BASE + path); await p.waitForLoadState("networkidle");
  const t = (await p.textContent("body")).replace(/\s+/g, " ");
  const m = t.match(/Application error|Something went wrong|Internal Server Error|Try again/i); return { status: r.status(), url: p.url(), broken: !!m, why: m?.[0] };
}
const pages = { creator: ["u-96475964@example.invalid", ["/dashboard", "/inbox", "/media-kit", "/notifications", "/content", "/opportunities", "/collaborations", "/settings"]],
  company: ["u-8d2bd531@example.invalid", ["/dashboard", "/discover", "/briefs", "/shortlists", "/team", "/notifications", "/onboarding"]],
  admin: ["u-51fa9057@example.invalid", ["/admin/users", "/admin/requests", "/admin/verification", "/admin/taxonomy", "/admin/relays", "/admin/news", "/admin/system", "/inbox"]] };
for (const [role, [email, paths]] of Object.entries(pages)) {
  const p = await login(email);
  const res = []; for (const path of paths) res.push([path, await visit(p, path)]);
  const bad = res.filter(([, r]) => r.status >= 400 || r.broken || r.url.includes("/login") || new URL(r.url).pathname === "/verification");
  ok(`existing ${role}: ${paths.length} pages load (no redirect to /verification, no error page)`, bad.length === 0, bad.map(([p, r]) => `${p} ${r.status} ${r.url} ${r.why || ""}`).join("; ") || paths.join(" "));
  if (role === "company") {
    const dir = await visit(p, "/discover");
    const names = (await p.textContent("body")).match(/Name [0-9a-f]{6}/g) || [];
    ok("company Discover lists the existing creators", new Set(names).size >= 1, `${new Set(names).size} creator card(s)`);
  }
  if (role === "creator") {
    // Chat relay on an email room: the reply goes through the relay lifecycle to the mock provider.
    const chat = "eec290f3-a9d6-4678-ba80-de4d27a51826";
    await visit(p, "/inbox/" + chat);
    const before = outbox().filter((m) => m.host === "api.resend.com").length;
    const box = await p.$("textarea");
    if (box) {
      await box.fill("Isolated relay test message, no contact details.");
      await p.keyboard.press("Enter").catch(() => {});
      const send = p.getByRole("button", { name: /send/i }).first(); if (await send.count()) await send.click().catch(() => {});
      await p.waitForTimeout(3000);
    }
    const row = sql(`select coalesce(relay_status,'NULL')||'|'||coalesce(relay_provider_id,'')||'|'||relay_attempts from public.messages where chat_id='${chat}' and message_text like 'Isolated relay test%' order by created_at desc limit 1`);
    const after = outbox().filter((m) => m.host === "api.resend.com");
    ok("creator reply relayed once via the lifecycle (mock provider)", /^sent\|mock-/.test(row) && after.length === before + 1, `${row}; ${after.length - before} mock send(s)`);
    ok("relay send carried an idempotency key", after.at(-1)?.idempotencyKey === true, String(after.at(-1)?.idempotencyKey));
    // YouTube OAuth: start redirects to Google's consent page; nothing is fetched. A forged callback is refused.
    const r = await p.request.get(BASE + "/api/oauth/youtube/start", { maxRedirects: 0 });
    const loc = r.headers()["location"] || "";
    ok("YouTube OAuth start redirects to Google consent with state", [302, 303, 307].includes(r.status()) && loc.startsWith("https://accounts.google.com/") && /state=/.test(loc) && /yt-analytics\.readonly/.test(decodeURIComponent(loc)), `HTTP ${r.status()} ${loc.slice(0, 60)}`);
    const cb = await p.request.get(BASE + "/api/oauth/youtube/callback?code=fake&state=forged", { maxRedirects: 0 });
    ok("forged OAuth callback refused, no token stored", sql("select count(*) from public.oauth_connections") === "2", `HTTP ${cb.status()} -> ${(cb.headers()["location"] || "").replace(/^https?:\/\/[^/]+/, "")}`);
  }
}
// Nothing left the machine: only mocked hosts appear, and none was a real call.
const all = outbox();
const hosts = [...new Set(all.map((m) => m.host))];
ok("no unmocked external request", !all.some((m) => m.blocked), `hosts seen: ${hosts.join(", ") || "none"}`);
ok("emails only to test addresses", all.filter((m) => m.host === "api.resend.com").every((m) => (m.body?.to || []).every((t) => t.endsWith("@example.invalid"))), `${all.filter((m) => m.host === "api.resend.com").length} mock email(s)`);
await browser.close();
