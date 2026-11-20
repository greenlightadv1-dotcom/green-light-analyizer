/**
 * Password recovery: the pure rules (tested in recovery.test.ts).
 *
 * The journey is /forgot-password → Supabase emails a link → /auth/recovery
 * verifies it and opens a recovery session → /reset-password sets the new
 * password → every session is revoked and the person signs in again.
 */

/** Where Supabase sends the person back after they open the emailed link. */
export const RECOVERY_CALLBACK_PATH = "/auth/recovery";
export const RESET_PASSWORD_PATH = "/reset-password";
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** Why a recovery link could not be used; each maps to `passwordReset.link.<reason>`. */
export type RecoveryLinkProblem = "expired" | "invalid" | "browser";

/**
 * Supabase reports a used or expired emailed link as `otp_expired` (it cannot
 * tell the two apart: a used token no longer exists), a PKCE exchange whose
 * verifier cookie is missing as `pkce_code_verifier_not_found` (the link was
 * opened in another browser), and an expired PKCE flow as `flow_state_expired`.
 * A reused or unknown code is `flow_state_not_found`, which is simply invalid.
 * Never echo provider text to the page.
 */
export function recoveryProblem(error: { code?: string | null; message?: string | null; name?: string | null } | null | undefined): RecoveryLinkProblem {
  const code = (error?.code ?? "").toLowerCase();
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (code === "pkce_code_verifier_not_found" || code === "bad_code_verifier" || /code verifier/.test(text)) return "browser";
  if (code === "otp_expired" || code === "flow_state_expired" || /expired/.test(text)) return "expired";
  return "invalid";
}

/**
 * A session opened by a recovery link authenticates with a one-time code
 * (`amr` method "otp"), never with a password. This product has no other
 * passwordless sign-in (self sign-up is off, there is no magic-link login), so
 * a session with no "password" method is confined to /reset-password until a
 * password is set. A missing or unreadable `amr` is NOT treated as recovery:
 * the confinement must never lock out an ordinary signed-in user.
 */
export function isRecoveryOnlySession(amr: unknown): boolean {
  if (!Array.isArray(amr) || amr.length === 0) return false;
  const methods = amr.map((e) => (typeof e === "object" && e !== null ? (e as { method?: unknown }).method : e)).filter((m): m is string => typeof m === "string");
  if (methods.length === 0) return false;
  return !methods.includes("password") && methods.every((m) => m === "otp" || m === "recovery" || m === "magiclink");
}

/** Reads `amr` from a JWT the caller has already verified (getUser in the same request). */
export function amrFromAccessToken(token: string | null | undefined): unknown {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    // atob exists in Node and in the edge runtime alike; the payload is ASCII JSON.
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.amr ?? null;
  } catch {
    return null;
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
export function isEmailShape(v: string): boolean {
  return v.length <= 254 && EMAIL.test(v);
}

/** Shown on the reset page so the person knows which account they are resetting. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}
