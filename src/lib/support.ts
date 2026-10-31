/**
 * Published support hours (owner decision, 2026-10-31): every day,
 * 10:00 AM to 10:00 PM Cairo local time.
 *
 * Held as an IANA zone, never a fixed UTC offset: Egypt observes daylight
 * saving time (UTC+2 in winter, UTC+3 in summer), so "UTC+2" would be an hour
 * wrong for half the year. Whether a moment falls inside the hours is
 * computed with Intl in that zone.
 *
 * These are the hours support is staffed. They are not a promise of 24/7
 * cover or of an instant reply.
 *
 * Pure (no server imports), so it is unit-tested directly (support.test.ts).
 */

import { DISCORD_INVITE_URL, WHATSAPP_URL } from "./constants/contact.ts";
import { SUPPORT_EMAIL } from "./constants/legal.ts";

export const SUPPORT_TIME_ZONE = "Africa/Cairo";

/** Opening and closing hour, 24-hour clock, Cairo local time. Close is exclusive. */
export const SUPPORT_OPEN_HOUR = 10;
export const SUPPORT_CLOSE_HOUR = 22;

/** The local hour and minute in Cairo at `date`. */
export function cairoTime(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SUPPORT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { hour: value("hour"), minute: value("minute") };
}

/** True when `date` falls inside the daily support hours in Cairo. */
export function isWithinSupportHours(date: Date): boolean {
  const { hour } = cairoTime(date);
  return hour >= SUPPORT_OPEN_HOUR && hour < SUPPORT_CLOSE_HOUR;
}

/**
 * The three support channels, built only from the destinations the product
 * already publishes — the support address in constants/legal.ts (the one the
 * Terms name) and the Discord invite and WhatsApp link in constants/contact.ts
 * (the ones the landing page and /suspended use). Nothing here defines a new
 * address, number or link; change those at their source.
 *
 * Discord opens the server invite: tickets are raised inside Discord. There is
 * no in-app ticket system.
 */
export type SupportChannelId = "email" | "discord" | "whatsapp";

export type SupportChannel = {
  id: SupportChannelId;
  href: string;
  /** External links open in a new tab; mailto hands off to the mail app. */
  external: boolean;
};

export const SUPPORT_CHANNELS: readonly SupportChannel[] = [
  { id: "email", href: `mailto:${SUPPORT_EMAIL}`, external: false },
  { id: "discord", href: DISCORD_INVITE_URL, external: true },
  { id: "whatsapp", href: WHATSAPP_URL, external: true },
];
