import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCOPES, grantable, isScopeId, permissionErrorKey } from "./company-access.ts";
import { parseCompanyDetails } from "./company-details.ts";

const sql = readFileSync(new URL("../../supabase/migrations/0034_company_permissions.sql", import.meta.url), "utf8");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the scope catalogue matches what the database will grant", () => {
  const avail = SCOPES.filter((s) => s.status === "available").map((s) => `'${s.id}'`).join(", ");
  const gated = SCOPES.filter((s) => s.status === "approval_required").map((s) => `'${s.id}'`).join(", ");
  assert.ok(sql.includes(`if p_scope not in (${avail}) then raise exception 'perm:not_available'`), "available list");
  assert.ok(sql.includes(`if p_scope in (${gated}) then raise exception 'perm:approval_required'`), "gated list");
  for (const s of SCOPES) assert.ok(sql.includes(`'${s.id}'`), s.id);
  // Financial or contractual scopes are never grantable from the product.
  for (const id of ["invitations.send", "deals.financial", "members.manage"] as const) assert.equal(grantable(id), false);
  assert.equal(grantable("discovery.view"), true);
  assert.ok(!isScopeId("admin.everything"));
});

test("refusals map to keys", () => {
  assert.equal(permissionErrorKey("perm:approval_required"), "team.errors.approval_required");
  assert.equal(permissionErrorKey("boom"), "ui.errors.generic");
});

test("company details: same rules for the company and a representative", () => {
  const f = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  assert.ok(parseCompanyDetails(f({ full_name: "Acme", bio: "We make games.", company_industry: "Gaming", company_website: "acme.example" })).ok);
  const masked = parseCompanyDetails(f({ full_name: "Acme", bio: "Call 01012345678", company_industry: "Gaming" }));
  assert.deepEqual(masked, { ok: false, error: "contact_details" });
  assert.deepEqual(parseCompanyDetails(f({ full_name: "A", bio: "x", company_industry: "x" })), { ok: false, error: "name" });
  assert.deepEqual(parseCompanyDetails(f({ full_name: "Acme", bio: "x", company_industry: "x", company_website: "javascript:alert(1)" })), { ok: false, error: "website" });
});

test("server checks: the actor is the session, a representative never manages scopes, edits need company.edit", () => {
  const actions = src("app/(app)/team/actions.ts");
  assert.match(actions, /p_actor: profile\.id/);
  assert.doesNotMatch(actions, /fd\.get\("(company_id|actor|p_actor)"\)/);
  assert.match(actions, /if \(await representationOf\(profile\)\) return fail\("team\.errors\.not_allowed"\)/);
  assert.match(actions, /hasCompanyScope\(profile, "company\.edit"\)/);
  assert.match(actions, /\.eq\("id", allowed\.companyId\)\.eq\("role", "company"\)/);
  // Scopes are read fresh on every request (no module-level cache).
  assert.doesNotMatch(src("lib/company-access-server.ts"), /\bcache\(/);
  // Discover refuses a representative without discovery.view; the RPC does too.
  assert.match(src("app/(app)/discover/page.tsx"), /!rep\.scopes\.includes\("discovery\.view"\)/);
  assert.match(sql, /private\.member_has_scope\(caller\.id, cm\.company_id, 'discovery\.view'\)/);
});
