#!/usr/bin/env node
/**
 * Move every creator's inbound alias onto the current domain (§5.1).
 *
 * An alias lives in two places: this database, and the Gmail auto-forwarding
 * rule the creator set up once and will not revisit. Rewriting the column
 * alone silently strands the rule, so the old value is kept in
 * `previous_inbound_alias`, which the intake still accepts (migration 0020).
 * The creator re-points their rule whenever they notice; nothing breaks in the
 * meantime.
 *
 * Idempotent: a creator already on the current domain is skipped, so this is
 * safe to re-run after adding accounts.
 *
 * Usage:
 *   node scripts/rotate-inbound-aliases.mjs           # report only
 *   node scripts/rotate-inbound-aliases.mjs --apply   # write
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* optional */
  }
}

const DOMAIN = process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "analyze.greenlightadvs.com";
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

/** Same generator as src/lib/alias.ts: 4 chars, no look-alike glyphs. */
function suffix() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: creators, error } = await admin
  .from("profiles")
  .select("id, full_name, inbound_alias, previous_inbound_alias")
  .eq("role", "creator")
  .not("inbound_alias", "is", null);

if (error) {
  console.error("Could not read profiles:", error.message);
  process.exit(1);
}

const stale = creators.filter((c) => !c.inbound_alias.endsWith(`@${DOMAIN}`));

console.log(`\n  ${creators.length} creator(s) with an alias; ${stale.length} not on @${DOMAIN}.`);
if (!stale.length) {
  console.log("  Nothing to do.\n");
  process.exit(0);
}

let failures = 0;
for (const c of stale) {
  // Keep the identity they already had — the local part's first segment —
  // rather than re-deriving from full_name, which may have changed since.
  const handle = c.inbound_alias.split("@")[0].split(".")[0] || "creator";
  const next = `${handle}.${suffix()}@${DOMAIN}`;

  console.log(`  ${c.full_name}: ${c.inbound_alias}  ->  ${next}`);

  if (!apply) continue;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ inbound_alias: next, previous_inbound_alias: c.inbound_alias })
    .eq("id", c.id);

  if (updateError) {
    failures += 1;
    console.error(`    FAILED: ${updateError.message}`);
  }
}

console.log(
  apply
    ? `\n  Done. ${stale.length - failures} rotated, ${failures} failed.\n  Tell each creator their new address — the old one keeps working until you clear previous_inbound_alias.\n`
    : "\n  Dry run. Re-run with --apply to write.\n",
);
process.exit(failures ? 1 : 0);
