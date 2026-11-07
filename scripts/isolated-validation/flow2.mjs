// Isolated workflow test, part 2: resume link -> details -> documents -> submit.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const BASE = "http://localhost:3200", DB = process.env.DB_URL;
const sql = (q) => execFileSync("psql", [DB, "-XqAt", "-c", q]).toString().trim();
const ok = (name, cond, detail = "") => console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
const { link } = JSON.parse(readFileSync(process.env.STATE, "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(link.replace("127.0.0.1", "localhost"));
await page.waitForLoadState("networkidle");
const fields = await page.$$eval("input,select,textarea", (xs) => xs.map((x) => x.name).filter((n) => n && !n.startsWith("$")));
ok("resume link opens the application with its case", fields.includes("case_id"), fields.join(","));
const caseId = sql("select c.id from public.verification_cases c join public.access_requests r on r.id=c.access_request_id where r.email='applicant@example.invalid'");
const vals = { registered_name: "Isolated Test Co LLC", registration_number: "CR-0001", tax_number: "TX-0001", country: "EG", contact_name: "Isolated Applicant", contact_phone: "+201000000001", website: "https://example.invalid" };
for (const [k, v] of Object.entries(vals)) {
  const el = await page.$(`[name="${k}"]`);
  if (!el) continue;
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === "SELECT") await el.selectOption(v); else await el.fill(v);
}
await page.click('form:has(input[name="case_id"]) button[type="submit"]');
await page.waitForTimeout(1500);
const saved = sql(`select details->>'registration_number' from public.verification_cases where id='${caseId}'`);
ok("case details saved through the server action", saved === "CR-0001", saved);
// Minimal valid PDFs, uploaded through the real route with the applicant cookie.
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
for (const doc of ["commercial_register", "tax_card", "authorization_letter"]) {
  const r = await page.request.post(BASE + "/api/applications/documents", { multipart: { case_id: caseId, doc_type: doc, capture: "upload", file: { name: doc + ".pdf", mimeType: "application/pdf", buffer: pdf } } });
  ok(`upload ${doc}`, r.status() === 200 || r.status() === 201, `HTTP ${r.status()}`);
}
// Identity-image types are refused for a company case, and an upload without the cookie is refused.
const bad = await page.request.post(BASE + "/api/applications/documents", { multipart: { case_id: caseId, doc_type: "selfie", capture: "upload", file: { name: "x.pdf", mimeType: "application/pdf", buffer: pdf } } });
ok("selfie refused on a company case", bad.status() === 400, `HTTP ${bad.status()}`);
const anon = await (await browser.newContext()).request.post(BASE + "/api/applications/documents", { multipart: { case_id: caseId, doc_type: "tax_card", capture: "upload", file: { name: "x.pdf", mimeType: "application/pdf", buffer: pdf } } });
ok("upload without the applicant cookie refused", anon.status() === 401, `HTTP ${anon.status()}`);
const stored = sql(`select count(*) from storage.objects where bucket_id='verification-docs' and name like '%'`);
ok("documents stored in the private verification-docs bucket", Number(stored) >= 3, `${stored} object(s)`);
await page.reload(); await page.waitForLoadState("networkidle");
console.log("BUTTONS:", (await page.$$eval("button", (bs) => bs.map((b) => b.textContent.trim()).filter(Boolean))).join(" | "));
writeFileSync(process.env.STATE, JSON.stringify({ link, caseId }));
await ctx.storageState({ path: process.env.STATE + ".ctx" });
await browser.close();
