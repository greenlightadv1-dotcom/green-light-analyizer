import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls a route with `Authorization: Bearer <CRON_SECRET>`. An
 * unset or short secret refuses every caller, so a missing env var can never
 * leave a cron route open to the internet.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
