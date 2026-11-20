import { timingSafeEqual } from "node:crypto";
import { previewWritesBlocked } from "./preview-guard.ts";

/**
 * Vercel Cron calls a route with `Authorization: Bearer <CRON_SECRET>`. An
 * unset or short secret refuses every caller, so a missing env var can never
 * leave a cron route open to the internet. A Vercel preview refuses too
 * (lib/preview-guard.ts), so a shared secret can never run a job there.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (previewWritesBlocked()) return false;
  if (!secret || secret.length < 16 || !authorization) return false;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
