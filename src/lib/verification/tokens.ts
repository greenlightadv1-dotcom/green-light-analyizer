import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One-time tokens for the application → activation flow (migration 0032,
 * docs/ACCOUNT_ACTIVATION_FLOW.md).
 *
 * - 32 random bytes from the OS CSPRNG, base64url (43 characters).
 * - Only the SHA-256 hex digest is stored (application_tokens.token_hash).
 *   The raw token exists in the email and, for a resume token, in the
 *   applicant's httpOnly cookie. It is never logged.
 * - Expiry, single use, revocation and replay are enforced in the database
 *   functions, not here: the server never trusts its own clock or cache for
 *   that decision.
 *
 * Pure apart from the CSPRNG — tested in tokens.test.ts.
 */

/** A resume link lets an applicant continue their own application. */
export const RESUME_TTL_SECONDS = 14 * 24 * 3600;
/** An activation link creates the account once. Owner may change; see the flow doc. */
export const ACTIVATION_TTL_SECONDS = 48 * 3600;
export const ACTIVATION_TTL_HOURS = ACTIVATION_TTL_SECONDS / 3600;

/** httpOnly cookie holding the applicant's resume token (never readable by scripts). */
export const APPLICATION_COOKIE = "gl_application";

const SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** Reject anything that cannot be a token before touching the database. */
export function isTokenShape(raw: unknown): raw is string {
  return typeof raw === "string" && SHAPE.test(raw);
}

/** Constant-time comparison of two hex digests (used by tests and any in-memory check). */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

const ACTIVATION_CODES = new Set([
  "not_found", "used", "revoked", "expired", "locked", "in_progress", "not_approved", "not_claimed",
  "already_activated", "not_allowed", "invalid_input",
]);

/** Map a database refusal ('activation:<code>') to a dictionary key. */
export function activationErrorKey(message: string | null | undefined): string {
  const m = /activation:([a-z_]+)/.exec(message ?? "");
  return m && ACTIVATION_CODES.has(m[1]) ? `activation.errors.${m[1]}` : "activation.errors.generic";
}

/** Same-site, httpOnly, secure outside local development. */
export function applicationCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: RESUME_TTL_SECONDS };
}
