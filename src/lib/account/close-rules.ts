/**
 * Pure rules for closing one's own account (migration 0044). Kept apart from
 * the server code so they are unit-tested directly.
 */

/** The database's refusals → dictionary keys the Settings card shows. */
export function closeAccountErrorKey(message: string | undefined | null): string {
  const m = message ?? "";
  if (m.includes("account:open_deals")) return "settings.deleteAccount.errorOpenDeals";
  if (m.includes("account:admin")) return "settings.deleteAccount.errorAdmin";
  if (m.includes("account:closed")) return "settings.deleteAccount.errorClosed";
  return "ui.errors.generic";
}

/** The address an anonymised auth user is moved to: unique, undeliverable. */
export function closedAccountEmail(profileId: string): string {
  return `deleted+${profileId}@invalid.greenlightadvs.com`;
}

/** The person must type this word, in either script, to confirm. */
export const CONFIRM_WORDS = ["DELETE", "حذف"] as const;
export function confirmWordMatches(value: unknown): boolean {
  const v = String(value ?? "").trim();
  return CONFIRM_WORDS.some((w) => v.toUpperCase() === w.toUpperCase());
}

/** Storage prefixes that belong to one person: `<owner uuid>/…` (§17 uploads). */
export const OWNED_BUCKETS = ["avatars", "creator-documents"] as const;
