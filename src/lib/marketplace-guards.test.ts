import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

/**
 * Source-level guards for the surfaces added with Get Started, onboarding,
 * uploads, representatives, Discovery and G. These modules import
 * "server-only" and cannot run under node:test, so — like
 * rate-limit-coverage.test.ts — this reads their source and fails the moment
 * an authorization or isolation check is removed.
 */

const SRC = new URL("../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, SRC), "utf8");
const migration = () => {
  const dir = new URL("../supabase/migrations/", SRC);
  const name = readdirSync(dir).find((f) => f.startsWith("0024_"));
  assert.ok(name, "migration 0024 missing");
  return readFileSync(new URL(name, dir), "utf8");
};

function body(file: string, name: string): string {
  const source = read(file);
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start !== -1, `${name} not found in ${file}`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("Get Started never creates an auth user or a profile (admin-gated, §4)", () => {
  const src = read("app/get-started/actions.ts");
  assert.ok(!/auth\.admin\.createUser|\.from\("profiles"\)/.test(src), "applications must only write access_requests");
  assert.match(src, /\.from\("access_requests"\)\.insert/);
  assert.match(src, /HONEYPOT_FIELD/);
  assert.match(read("lib/supabase/session.ts"), /"\/get-started"/, "Get Started must be public");
});

test("landing CTAs open Get Started instead of an external request link", () => {
  for (const f of ["components/landing/Hero.tsx", "components/landing/LandingNav.tsx"]) {
    const src = read(f);
    assert.match(src, /href="\/get-started"/, f);
    assert.ok(!src.includes("DISCORD_INVITE_URL"), `${f} still links Discord as the access path`);
  }
});

test("application review and representative links are admin-only", () => {
  for (const fn of ["rejectRequest", "linkRepresentative", "unlinkRepresentative"]) {
    assert.match(body("app/(app)/admin/requests/actions.ts", fn), /requireRole\("admin"\)/, fn);
  }
  assert.match(read("app/(app)/admin/requests/page.tsx"), /requireRole\("admin"\)/);
  // createUser stays the only account-creation path, and approves an application only while pending.
  const create = body("app/(app)/admin/users/actions.ts", "createUser");
  assert.match(create, /requireRole\("admin"\)/);
  assert.match(create, /\.eq\("status", "pending"\)/);
  // Representatives are company accounts; no new role is introduced.
  assert.match(body("app/(app)/admin/requests/actions.ts", "linkRepresentative"), /role !== "company"/);
});

test("onboarding writes are role-checked and scoped to the session's own row", () => {
  const cls = body("app/(app)/onboarding/actions.ts", "saveClassification");
  assert.match(cls, /profile\.role !== "creator"/);
  assert.match(cls, /\.eq\("id", profile\.id\)/);
  assert.match(cls, /parseClassification/);
  const co = body("app/(app)/onboarding/actions.ts", "saveCompanyDetails");
  assert.match(co, /profile\.role !== "company"/);
  assert.match(co, /\.eq\("id", profile\.id\)/);
  assert.match(co, /maskSensitiveData\(bio\)\.isMasked/, "company description must refuse contact details (§6)");
});

test("a company with incomplete details cannot send an offer", () => {
  assert.match(body("app/(app)/discover/actions.ts", "sendOfferToCreator"), /companyDetailsComplete\(profile\)/);
});

test("upload routes authenticate, sniff content and stay inside the owner's folder", () => {
  const avatar = read("app/api/uploads/avatar/route.ts");
  const docs = read("app/api/uploads/documents/route.ts");
  for (const [name, src] of [["avatar", avatar], ["documents", docs]] as const) {
    for (const fn of src.match(/export async function (GET|POST|DELETE)/g) ?? []) {
      const verb = fn.split(" ").pop()!;
      assert.match(body(`app/api/uploads/${name}/route.ts`, verb), /loadApiSession\(\)/, `${name} ${verb}`);
    }
  }
  assert.match(body("app/api/uploads/documents/route.ts", "DELETE"), /isOwnedPath\(session\.profile\.id, path\)/);
  assert.match(body("app/api/uploads/documents/route.ts", "GET"), /role !== "admin"/, "only an admin may list another owner's files");
  assert.match(read("lib/upload-server.ts"), /checkUpload\(/, "type must be sniffed server-side");
  assert.match(avatar, /ownedAvatarPath\(/, "only this owner's previous avatar may be deleted");
});

test("G reads only the session's own data and offers only allow-listed navigation", () => {
  const route = read("app/api/g/route.ts");
  assert.match(route, /loadGSession\(\)|loadApiSession\(\)/);
  assert.match(route, /allowedActions\(/);
  assert.match(route, /ungroundedFigures\(/, "model replies must be checked for invented figures");
  const ctx = read("lib/g/context.ts");
  assert.match(ctx, /\.eq\(column, profile\.id\)/, "deals must be filtered by the session id");
  assert.ok(!/createAdminClient/.test(ctx), "G context must use the caller's RLS client, never the service role");
  const conv = read("lib/g/conversation.ts");
  assert.ok(!/userId|profile_id|creator_id/.test(conv.slice(conv.indexOf("export function parseGRequest"), conv.indexOf("export function parseGRequest") + 1500)), "the request body must not choose whose data is read");
});

test("migration 0024 keeps the new tables closed to clients", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.access_requests enable row level security/);
  assert.match(sql, /revoke all on public\.access_requests from anon, authenticated/);
  assert.match(sql, /alter table public\.company_members enable row level security/);
  assert.ok(!/create policy[^;]*on public\.company_members\s+for (insert|update|delete)/i.test(sql), "company_members writes must stay admin/service-role only");
  // The directory RPC never returns contact or intake fields.
  const at = sql.indexOf("create function public.creator_directory()");
  assert.ok(at !== -1, "creator_directory not redefined");
  const fn = sql.slice(at, sql.indexOf("$$;", at));
  for (const col of ["primary_email", "inbound_alias", "whatsapp_number"]) assert.ok(!fn.includes(col), `creator_directory exposes ${col}`);
  // New profile columns are written only by validated server actions.
  assert.ok(!/grant update \([^)]*creator_categories/.test(sql), "classification must not be client-writable");
  // Storage buckets have size limits and no client policies.
  assert.match(sql, /'avatars'/);
  assert.match(sql, /'creator-documents'/);
  assert.ok(!/on storage\.objects/i.test(sql.replace(/--.*$/gm, "")), "no client storage.objects policies: uploads go through the server");
});

test("“Hey G” background listening never stores, logs or sends what it hears", () => {
  const hook = read("components/g/useWakeWord.ts");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|console\.|localStorage/.test(hook), "no network, logging or persistent storage in the wake listener");
  // sessionStorage holds only the opt-in flag, never speech.
  for (const m of hook.matchAll(/sessionStorage\.(setItem|getItem|removeItem)\(([^,)]+)/g)) assert.match(m[2], /^wakeKey\(userId$/);
  assert.match(hook, /interimResults = false/);
  // Off by default: listening starts only after enable() → getUserMedia.
  assert.match(hook, /useState\(false\)/);
  assert.match(hook, /getUserMedia\(\{ audio: true \}\)/);
  // Only the words after a wake phrase can reach G.
  const panel = read("components/g/GAssistant.tsx");
  assert.match(panel, /onWake: \(question\) =>/);
  assert.ok(!/matchWake|transcript/.test(panel), "the panel never sees raw background speech");
  // Sign-out clears G's tab data and stops listening.
  assert.match(read("components/dashboard/TopBar.tsx"), /signOutG/);
});

test("the SQL Editor handoff copy of 0024 is byte-identical to the migration", () => {
  const original = readFileSync(new URL("../supabase/migrations/0024_marketplace_onboarding_taxonomy_uploads.sql", SRC));
  const copy = readFileSync(new URL("../docs/handoff/migration-0024/0024_marketplace_onboarding_taxonomy_uploads.sql", SRC));
  assert.ok(original.equals(copy), "docs/handoff/migration-0024 drifted from supabase/migrations/0024 — recopy it");
});
