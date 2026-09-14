#!/usr/bin/env node
/**
 * Bootstrap the first admin account.
 *
 * Green Light is admin-gated (CLAUDE.md §4.1) — accounts can only be created by
 * an admin, which leaves a chicken-and-egg problem for the very first one. This
 * script solves exactly that, from a trusted shell with the service-role key.
 * Every subsequent account is created in-app at /admin/users.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs "Full Name" admin@example.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
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
    /* file is optional */
  }
}

const [fullName, email] = process.argv.slice(2);
if (!fullName || !email) {
  console.error(
    'Usage: node scripts/bootstrap-admin.mjs "Full Name" admin@example.com',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
  process.exit(1);
}

const tempPassword = Buffer.from(
  crypto.getRandomValues(new Uint8Array(18)),
).toString("base64url");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  app_metadata: { must_change_password: true },
});

if (error) {
  console.error("Could not create the auth user:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin.from("profiles").insert({
  id: data.user.id,
  full_name: fullName,
  role: "admin",
  region: "MENA",
  subscription_plan: "Elite",
  inbound_alias: null,
  primary_email: email,
  must_change_password: true,
});

if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("Rolled back — profile insert failed:", profileError.message);
  process.exit(1);
}

console.log(`\n  Admin created: ${email}`);
console.log(`  Temporary password: ${tempPassword}`);
console.log(`  You will be forced to change it on first login.\n`);
