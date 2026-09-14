/**
 * Pure date math for subscription expiry — no secrets or Supabase access, so
 * (unlike most of src/lib) this deliberately carries no "server-only" guard:
 * it needs to be directly unit-testable under plain `node --test`, which
 * throws on any module that imports "server-only" (Next's bundler is what
 * swaps that package for a no-op; plain Node never does).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp `days` days from now — used to set subscription_expires_at. */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** Whole days remaining until `iso`, rounded up. Negative once it has passed. */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

/**
 * New expiry when an admin renews/extends by `days`.
 *
 * Extends from the CURRENT expiry if it is still in the future, otherwise
 * from now — a user with 10 days left who gets a 30-day renewal ends up with
 * 40 days left, not 30. Renewing adds paid time; it should never discard
 * time already paid for.
 */
export function extendExpiry(currentExpiresAt: string | null, days: number): string {
  const now = Date.now();
  const currentMs = currentExpiresAt ? new Date(currentExpiresAt).getTime() : now;
  const base = currentMs > now ? currentMs : now;
  return new Date(base + days * DAY_MS).toISOString();
}
