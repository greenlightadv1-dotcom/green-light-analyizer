import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { amrFromAccessToken, isEmailShape, isRecoveryOnlySession, maskEmail, recoveryProblem } from "./recovery.ts";

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("link failures map to a safe reason, never to provider text", () => {
  assert.equal(recoveryProblem({ code: "otp_expired" }), "expired");
  assert.equal(recoveryProblem({ code: "flow_state_expired" }), "expired");
  assert.equal(recoveryProblem({ code: "pkce_code_verifier_not_found" }), "browser");
  assert.equal(recoveryProblem({ name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage." }), "browser");
  assert.equal(recoveryProblem({ code: "bad_code_verifier" }), "browser");
  assert.equal(recoveryProblem({ code: "flow_state_not_found" }), "invalid");
  assert.equal(recoveryProblem({ message: "Token has expired or is invalid" }), "expired");
  assert.equal(recoveryProblem({ code: "anything_else" }), "invalid");
  assert.equal(recoveryProblem(null), "invalid");
});

test("only a session with no password method is a recovery session", () => {
  assert.equal(isRecoveryOnlySession([{ method: "otp", timestamp: 1 }]), true);
  assert.equal(isRecoveryOnlySession([{ method: "recovery", timestamp: 1 }]), true);
  assert.equal(isRecoveryOnlySession([{ method: "password", timestamp: 1 }]), false);
  assert.equal(isRecoveryOnlySession([{ method: "otp" }, { method: "password" }]), false);
  // Unknown methods (OAuth, SSO, TOTP...) are never confined.
  assert.equal(isRecoveryOnlySession([{ method: "oauth" }]), false);
  assert.equal(isRecoveryOnlySession([{ method: "otp" }, { method: "totp" }]), false);
  // Missing or unreadable amr must never lock out an ordinary user.
  for (const v of [null, undefined, [], "otp", [{}], [{ method: 5 }], {}]) assert.equal(isRecoveryOnlySession(v), false, JSON.stringify(v));
});

test("amr is read from a token payload; garbage yields null", () => {
  assert.deepEqual(amrFromAccessToken(jwt({ amr: [{ method: "otp" }] })), [{ method: "otp" }]);
  assert.equal(amrFromAccessToken(jwt({ sub: "x" })), null);
  for (const t of [null, undefined, "", "nodots", "a.%%%.b", "a.bm90IGpzb24.b"]) assert.equal(amrFromAccessToken(t), null, String(t));
});

test("email shape and masking", () => {
  assert.equal(isEmailShape("person@example.com"), true);
  for (const e of ["", "x", "a@b", "a b@c.de", `${"a".repeat(250)}@b.co`]) assert.equal(isEmailShape(e), false, e);
  assert.equal(maskEmail("creator@example.com"), "cr•••••@example.com");
  assert.equal(maskEmail("a@example.com"), "a•@example.com");
  assert.equal(maskEmail(null), null);
});

test("the request action answers the same for every well-formed address", () => {
  const src = read("../../app/(auth)/forgot-password/actions.ts");
  const body = src.slice(src.indexOf("export async function requestPasswordReset"));
  // The provider result may be logged, but the only return after the call is "sent".
  const after = body.slice(body.indexOf("resetPasswordForEmail"));
  assert.deepEqual([...after.matchAll(/return \{ status: "([a-z_]+)" \}/g)].map((m) => m[1]), ["sent"]);
  assert.match(body, /consumeRateLimit\("password_reset_client", await clientKey\(\)\)/);
  assert.match(body, /consumeRateLimit\("password_reset", emailKey\)/);
  assert.doesNotMatch(body, /log\.[a-z]+\([^)]*email[,)]/, "the address must never be logged");
  assert.match(body, /redirectTo: `\$\{siteUrl\(\)\}\$\{RECOVERY_CALLBACK_PATH\}`/);
});

test("the callback redirects only to fixed paths, never to a parameter", () => {
  const src = read("../../app/auth/recovery/route.ts");
  for (const m of src.matchAll(/to\(([^)]*)\)/g)) assert.match(m[1], /^(RESET_PASSWORD_PATH|`\$\{FORGOT_PASSWORD_PATH\}\?link=\$\{problem\}`|path)$/, m[1]);
  assert.doesNotMatch(src, /searchParams\.get\("(next|redirect|redirect_to|to)"\)/);
});

test("the reset action requires a recovery-only session, then revokes every session", () => {
  const src = read("../../app/(auth)/reset-password/actions.ts");
  const check = src.indexOf("isRecoveryOnlySession(");
  const update = src.indexOf("supabase.auth.updateUser(");
  const out = src.indexOf('signOut({ scope: "global" })');
  assert.ok(check > 0 && update > check && out > update, "check, then update, then global sign-out");
  assert.match(src, /passwordProblems\(password\)/, "same rules as activation");
  assert.match(src, /redirect\("\/login\?reset=done"\)/);
});

test("the proxy confines recovery-only sessions to the reset page, and both pages are public", () => {
  const src = read("../supabase/session.ts");
  assert.match(src, /"\/forgot-password", "\/reset-password"/);
  assert.match(src, /recoveryOnly = isRecoveryOnlySession\(amrFromAccessToken\(session\?\.access_token\)\)/);
  const pin = src.indexOf("if (recoveryOnly) {");
  // On the reset page itself the later gates are skipped (no redirect loop with /set-password).
  assert.match(src, /if \(pathname === RESET_PASSWORD_PATH \|\| pathname\.startsWith\("\/auth\/"\)\) return response;/);
  const forced = src.indexOf("const mustChangePassword");
  assert.ok(pin > 0 && pin < forced, "the recovery pin runs before the forced-change gate");
});

test("still no sign-up anywhere in the recovery journey", () => {
  for (const p of ["../../app/(auth)/forgot-password/actions.ts", "../../app/auth/recovery/route.ts", "../../app/(auth)/reset-password/actions.ts"]) {
    assert.doesNotMatch(read(p), /signUp\(|signInWithOtp\(/, p);
  }
});
