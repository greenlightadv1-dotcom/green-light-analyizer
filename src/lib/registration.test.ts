import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JOURNEY_KIND, JOURNEY_ROLE, parseRegistration, passwordProblems, selfSignupEnabled } from "./registration.ts";

const good = { journey: "creator", full_name: "Layla  Hassan", email: " Layla@Example.com ", password: "Str0ng!Passw", terms: "on" };

test("self-registration is off unless explicitly enabled", () => {
  assert.equal(selfSignupEnabled({}), false);
  assert.equal(selfSignupEnabled({ SELF_SIGNUP_ENABLED: "true" }), false);
  assert.equal(selfSignupEnabled({ SELF_SIGNUP_ENABLED: "1" }), true);
});

test("registration validates every field and the password policy", () => {
  const ok = parseRegistration(good);
  assert.ok(ok.ok && ok.value.email === "layla@example.com" && ok.value.full_name === "Layla Hassan");
  assert.deepEqual(parseRegistration({ ...good, journey: "admin" }), { ok: false, field: "journey" });
  assert.deepEqual(parseRegistration({ ...good, email: "nope" }), { ok: false, field: "email" });
  assert.deepEqual(parseRegistration({ ...good, password: "short1!A" }), { ok: false, field: "password" });
  assert.deepEqual(parseRegistration({ ...good, terms: undefined }), { ok: false, field: "terms" });
  assert.deepEqual(passwordProblems("abcdefghij"), ["digit", "upper", "symbol"]);
});

test("no journey can register an admin, and each maps to its verification kind", () => {
  assert.ok(!Object.values(JOURNEY_ROLE).includes("admin"));
  assert.equal(JOURNEY_KIND.company_representative, "representative");
});

test("the register action never reveals whether an email exists and always starts pending", () => {
  const src = readFileSync(new URL("../app/register/actions.ts", import.meta.url), "utf8");
  assert.match(src, /selfSignupEnabled\(\)/);
  assert.match(src, /account_status: "pending_verification"/);
  assert.match(src, /consumeRateLimit\("access_request"/);
  // One answer for new and existing addresses.
  assert.equal((src.match(/return \{ status: "check_email" \}/g) ?? []).length >= 2, true);
  assert.doesNotMatch(src, /role: "admin"/);
});
