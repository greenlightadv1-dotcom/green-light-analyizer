import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { passwordProblems } from "./registration.ts";

test("password policy: length, digit, lower, upper, symbol, bcrypt limit", () => {
  assert.deepEqual(passwordProblems("Str0ng!Passw"), []);
  assert.deepEqual(passwordProblems("short1!A"), ["length"]);
  assert.ok(passwordProblems("alllowercase1!").includes("upper"));
  assert.ok(passwordProblems("NoDigitsHere!!").includes("digit"));
  assert.ok(passwordProblems("NoSymbols1234a").includes("symbol"));
  assert.ok(passwordProblems(`A1!${"a".repeat(80)}`).includes("long"));
});

test("no code path signs a visitor up before approval", () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  for (const p of ["app/get-started/actions.ts", "app/apply/actions.ts", "app/apply/continue/route.ts", "app/activate/actions.ts"]) {
    assert.doesNotMatch(src(p), /auth\.signUp|signInWithOtp|inviteUserByEmail/, p);
  }
  assert.ok(!existsSync(new URL("../app/register/actions.ts", import.meta.url)), "register action removed");
  assert.ok(!existsSync(new URL("../app/auth/confirm/route.ts", import.meta.url)), "sign-up confirmation route removed");
  assert.match(src("app/register/page.tsx"), /redirect\("\/get-started"\)/);
  // Step 1 creates a pending account (never active) with a verification case.
  const gs = src("app/get-started/actions.ts");
  assert.match(gs, /auth\.admin\.createUser/);
  assert.match(gs, /account_status: "pending_verification"/);
  assert.match(gs, /passwordProblems\(password\)/, "the applicant's password meets the same rules");
  // Activation (the older emailed-link path) is still gated by the database on approval.
  const act = src("app/activate/actions.ts");
  assert.match(act, /activation_claim/);
  assert.match(act, /activation_complete/);
});
