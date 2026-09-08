import "server-only";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp `days` days from now — used to set subscription_expires_at. */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** Whole days remaining until `iso`, rounded up. Negative once it has passed. */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}
