// P0-2: forgot-password journey on the isolated Supabase stack. Supabase's
// emails land in the local Mailpit; nothing leaves the machine.
// Needs: API_URL, ANON_KEY, SERVICE_ROLE_KEY, MAILPIT_URL, DB_URL, MOCK_OUTBOX.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const BASE = "http://localhost:3200", { API_URL, SERVICE_ROLE_KEY, MAILPIT_URL, DB_URL, MOCK_OUTBOX } = process.env;
const sql = (q) => execFileSync("psql", [DB_URL, "-XqAt", "-c", q]).toString().trim();
let fails = 0; const ok = (n, c, d = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };
const mp = async (path, init) => (await fetch(MAILPIT_URL + path, init)).json().catch(() => ({}));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailsTo(addr) { await wait(1500); const r = await mp(`/api/v1/search?query=${encodeURIComponent("to:" + addr)}`); return r.messages ?? []; }
async function linkFor(addr) {
  const msgs = await mailsTo(addr); if (!msgs.length) return null;
  const full = await mp(`/api/v1/message/${msgs[0].ID}`);
  return (full.HTML + full.Text).match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/)?.[0].replace(/&amp;/g, "&") ?? null;
}
const clearMail = () => fetch(MAILPIT_URL + "/api/v1/messages", { method: "DELETE" });
const browser = await chromium.launch();
const fresh = async (locale) => { const c = await browser.newContext(); if (locale) await c.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale); return c; };
async function signIn(ctx, email, pw) {
  const p = await ctx.newPage(); await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', pw);
  await p.click('form button[type="submit"]'); await p.waitForLoadState("networkidle"); await wait(800); return p;
}
async function request(page, email) {
  await page.goto(BASE + "/forgot-password"); await page.fill('input[name="email"]', email);
  const t0 = Date.now(); await page.click('form button[type="submit"]');
  await page.waitForSelector('[data-testid="reset-sent"], [role="alert"]', { timeout: 15000 }); return Date.now() - t0;
}
const KNOWN = "reset-creator@example.invalid", UNKNOWN = "nobody-here@example.invalid", OLD = "Old-Pass-1234!", NEW = "New-Pass-5678!";

// A. Entry point.
{ const c = await fresh(); const p = await c.newPage(); await p.goto(BASE + "/login");
  await p.click('a[href="/forgot-password"]'); await p.waitForURL("**/forgot-password");
  ok("sign-in page links to Forgot password", true); await c.close(); }

// B/C. No enumeration; invalid address.
await clearMail();
{ const c = await fresh(); const p = await c.newPage();
  const tKnown = await request(p, KNOWN); const known = (await p.textContent('[data-testid="reset-sent"]')).trim();
  const tUnknown = await request(p, UNKNOWN); const unknown = (await p.textContent('[data-testid="reset-sent"]')).trim();
  ok("known and unknown addresses get the identical confirmation", known === unknown && known.length > 20, `${tKnown}ms vs ${tUnknown}ms`);
  ok("only the real account is emailed (Mailpit)", (await mailsTo(KNOWN)).length === 1 && (await mailsTo(UNKNOWN)).length === 0);
  await p.goto(BASE + "/forgot-password"); await p.fill('input[name="email"]', "not-an-email"); await p.click('form button[type="submit"]');
  await p.waitForSelector('form [role="alert"]'); ok("a malformed address is refused before any lookup", (await p.textContent('form [role="alert"]')).includes("valid email"));
  await c.close(); }

// D-G. Same-browser link, confinement, validation, success, other sessions revoked.
const other = await fresh(); const otherPage = await signIn(other, KNOWN, OLD);
ok("a second device is signed in before the reset", otherPage.url().endsWith("/dashboard"), otherPage.url());
await clearMail();
const A = await fresh(); const ap = await A.newPage(); await request(ap, KNOWN);
const link1 = await linkFor(KNOWN);
await ap.goto(link1); await ap.waitForLoadState("networkidle");
ok("a valid link opens the reset page for the right (masked) account", ap.url().endsWith("/reset-password") && (await ap.textContent('[data-testid="reset-email"]')) === "re•••••••••••@example.invalid", ap.url());
await ap.goto(BASE + "/dashboard"); await ap.waitForLoadState("networkidle");
ok("the recovery session cannot reach the product (pinned to the reset page)", ap.url().endsWith("/reset-password"), ap.url());
// Long enough for the browser's own check, but no capital letter and no symbol: the server rules decide.
await ap.fill('input[name="password"]', "weakpassword1"); await ap.fill('input[name="confirm"]', "weakpassword1"); await ap.click('form button[type="submit"]');
await ap.waitForSelector('form [role="alert"]'); const rules = await ap.textContent('form [role="alert"]');
ok("a weak password is refused with the activation rules", /An upper-case letter/.test(rules) && /A symbol/.test(rules) && !/At least 10/.test(rules), rules.trim());
await ap.fill('input[name="password"]', NEW); await ap.fill('input[name="confirm"]', NEW + "x"); await ap.click('form button[type="submit"]');
await ap.waitForFunction(() => document.querySelector('form [role="alert"]')?.textContent.includes("match"));
ok("a mismatched confirmation is refused", true);
await ap.fill('input[name="password"]', NEW); await ap.fill('input[name="confirm"]', NEW); await ap.click('form button[type="submit"]');
await ap.waitForURL("**/login?reset=done", { timeout: 15000 });
ok("success lands on sign-in with a notice, signed out", (await ap.textContent('[data-testid="reset-done"]')).includes("new password"));
await ap.goto(BASE + "/dashboard"); await ap.waitForLoadState("networkidle");
ok("this browser holds no session afterwards", ap.url().includes("/login"), ap.url());
await otherPage.goto(BASE + "/dashboard"); await otherPage.waitForLoadState("networkidle");
ok("the other device's session was revoked", otherPage.url().includes("/login"), otherPage.url());
{ const c = await fresh(); const p = await signIn(c, KNOWN, OLD); ok("the old password no longer works", p.url().includes("/login")); await c.close(); }
{ const c = await fresh(); const p = await signIn(c, KNOWN, NEW); ok("the new password signs in", p.url().endsWith("/dashboard"), p.url()); await c.close(); }

// H. Reuse.
await ap.goto(link1); await ap.waitForLoadState("networkidle");
ok("a used link is refused with an understandable message", ap.url().includes("/forgot-password") && /expired or was already used|isn't valid/.test(await ap.textContent('[data-testid="link-problem"]')), ap.url());

// I. Other browser (PKCE verifier lives in the requesting browser).
await clearMail();
{ const c = await fresh(); const p = await c.newPage(); await request(p, KNOWN); await c.close(); }
{ const link = await linkFor(KNOWN); const c = await fresh(); const p = await c.newPage(); await p.goto(link); await p.waitForLoadState("networkidle");
  ok("a link opened in another browser explains what to do", p.url().includes("link=browser") && (await p.textContent('[data-testid="link-problem"]')).includes("same browser"), p.url()); await c.close(); }

// J. Malformed and missing.
for (const [label, path] of [["missing", "/auth/recovery"], ["malformed code", "/auth/recovery?code=%27%3B--"], ["unknown code", "/auth/recovery?code=aaaaaaaaaaaaaaaaaaaa"], ["bad token_hash", "/auth/recovery?token_hash=zzzzzzzzzzzzzzzz&type=recovery"], ["wrong type", "/auth/recovery?token_hash=zzzzzzzzzzzzzzzz&type=signup"]]) {
  const c = await fresh(); const p = await c.newPage(); const r = await p.goto(BASE + path); await p.waitForLoadState("networkidle");
  ok(`${label} link is refused safely`, p.url().includes("/forgot-password?link=") && r.status() < 500 && !!(await p.$('[data-testid="link-problem"]')), p.url().replace(BASE, "")); await c.close();
}

// K. Expired (age the request on the isolated stack only).
await clearMail();
{ const c = await fresh(); const p = await c.newPage(); await request(p, KNOWN);
  sql(`update auth.users set recovery_sent_at = now() - interval '3 hours' where email = '${KNOWN}'`);
  await p.goto(await linkFor(KNOWN)); await p.waitForLoadState("networkidle");
  ok("an expired link is refused as expired", (await p.textContent('[data-testid="link-problem"]')).includes("expired"), p.url().replace(BASE, "")); await c.close(); }

// L/M. token_hash (cross-device template) and the forced-change account.
async function tokenHashFor(email) {
  const r = await fetch(API_URL + "/auth/v1/admin/generate_link", { method: "POST", headers: { apikey: SERVICE_ROLE_KEY, authorization: "Bearer " + SERVICE_ROLE_KEY, "content-type": "application/json" }, body: JSON.stringify({ type: "recovery", email }) });
  return (await r.json()).hashed_token;
}
{ const FORCED = "reset-forced@example.invalid";
  const c = await fresh(); const p = await c.newPage(); await p.goto(`${BASE}/auth/recovery?token_hash=${await tokenHashFor(FORCED)}&type=recovery`); await p.waitForLoadState("networkidle");
  ok("a token_hash link works in any browser", p.url().endsWith("/reset-password") && !!(await p.$('input[name="password"]')), p.url());
  await p.fill('input[name="password"]', NEW); await p.fill('input[name="confirm"]', NEW); await p.click('form button[type="submit"]'); await p.waitForURL("**/login?reset=done");
  const flags = sql(`select (u.raw_app_meta_data->>'must_change_password')||'|'||p.must_change_password from auth.users u join public.profiles p on p.id=u.id where u.email='${FORCED}'`);
  ok("a reset satisfies a pending forced change (flag cleared in Auth and profile)", flags === "false|false", flags);
  const s = await signIn(await fresh(), FORCED, NEW); ok("that account now signs in straight to the dashboard", s.url().endsWith("/dashboard"), s.url()); await c.close(); }

// N. Reset page without a recovery session.
{ const c = await fresh(); const p = await c.newPage(); await p.goto(BASE + "/reset-password");
  ok("reset page with no session asks for a new link", !!(await p.$('[data-testid="reset-missing"]'))); await c.close(); }
{ const c = await fresh(); const p = await signIn(c, KNOWN, NEW); await p.goto(BASE + "/reset-password");
  ok("an ordinary signed-in user gets no reset form (pointed to Settings)", !!(await p.$('[data-testid="reset-signed-in"]')) && !(await p.$('input[name="password"]'))); await c.close(); }

// O. Five languages.
const TITLES = { en: "Reset your password", ar: "إعادة تعيين كلمة المرور", fr: "Réinitialiser votre mot de passe", es: "Restablecer tu contraseña", de: "Passwort zurücksetzen" };
const MISSING = {"en": "This page opens from the reset link we email you. The link may have expired or already been used.", "ar": "تُفتح هذه الصفحة من رابط إعادة التعيين الذي نرسله إليك بالبريد. ربما انتهت صلاحية الرابط أو استُخدم من قبل.", "fr": "Cette page s’ouvre depuis le lien de réinitialisation que nous vous envoyons. Le lien a peut-être expiré ou déjà été utilisé.", "es": "Esta página se abre desde el enlace que te enviamos por correo. Puede que haya caducado o que ya se usara.", "de": "Diese Seite öffnet sich über den Link, den wir dir per E-Mail schicken. Er ist vielleicht abgelaufen oder wurde bereits verwendet."};
const FORGOT = { en: "Forgot password?", ar: "نسيت كلمة المرور؟", fr: "Mot de passe oublié ?", es: "¿Olvidaste tu contraseña?", de: "Passwort vergessen?" };
for (const [loc, title] of Object.entries(TITLES)) {
  const c = await fresh(loc); const p = await c.newPage(); await p.goto(BASE + "/forgot-password"); await p.waitForLoadState("networkidle");
  const h1 = (await p.textContent("h1")).trim(); const dir = await p.evaluate(() => document.documentElement.dir);
  await p.goto(BASE + "/login"); await p.waitForLoadState("networkidle");
  await p.waitForFunction((want) => document.querySelector('a[href="/forgot-password"]')?.textContent.trim() === want, FORGOT[loc], { timeout: 10000 }).catch(() => {});
  const forgot = (await p.textContent('a[href="/forgot-password"]')).trim();
  ok(`${loc}: request page and sign-in link localized${loc === "ar" ? " (RTL)" : ""}`, h1 === title && forgot === FORGOT[loc] && (loc === "ar" ? dir === "rtl" : dir !== "rtl"), `${h1} / ${forgot}`);
  await p.goto(BASE + "/reset-password"); await p.waitForLoadState("networkidle");
  await p.waitForFunction((w) => document.querySelector('[data-testid="reset-missing"] p')?.textContent.trim() === w, MISSING[loc], { timeout: 10000 }).catch(() => {});
  ok(`${loc}: reset page state localized`, (await p.textContent('[data-testid="reset-missing"] p')).trim() === MISSING[loc]);
  await c.close();
}

// Q. Rate limit (per address; 5 an hour).
{ const c = await fresh(); const p = await c.newPage();
  for (let i = 0; i < 6; i++) await request(p, "flood-target@example.invalid");
  ok("the 6th request for one address within the hour is rate-limited", /Too many requests/.test(await p.textContent("body"))); await c.close(); }

// P. Nothing external.
const out = readFileSync(MOCK_OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
ok("no external request left the app (Supabase mail went to local Mailpit)", out.length === 0, `${out.length} outbox entries`);
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
