import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  SUPPORT_CLOSE_HOUR,
  SUPPORT_OPEN_HOUR,
  SUPPORT_TIME_ZONE,
  cairoTime,
  isWithinSupportHours,
  SUPPORT_CHANNELS,
} from "./support.ts";
import { DISCORD_INVITE_URL, WHATSAPP_PHONE, WHATSAPP_URL } from "./constants/contact.ts";
import { SUPPORT_EMAIL } from "./constants/legal.ts";

/** Published support hours: every day, 10:00–22:00 Cairo local time. */

test("hours are held as the Africa/Cairo IANA zone, 10:00 to 22:00", () => {
  assert.equal(SUPPORT_TIME_ZONE, "Africa/Cairo");
  assert.equal(SUPPORT_OPEN_HOUR, 10);
  assert.equal(SUPPORT_CLOSE_HOUR, 22);
});

test("winter (UTC+2): 08:00Z is 10:00 in Cairo, open; 07:59Z is closed", () => {
  assert.deepEqual(cairoTime(new Date("2026-01-15T08:00:00Z")), { hour: 10, minute: 0 });
  assert.equal(isWithinSupportHours(new Date("2026-01-15T08:00:00Z")), true);
  assert.equal(isWithinSupportHours(new Date("2026-01-15T07:59:00Z")), false);
});

test("summer daylight saving (UTC+3): 07:00Z is 10:00 in Cairo, open", () => {
  // A fixed UTC+2 offset would put this at 09:00 and wrongly call it closed.
  assert.deepEqual(cairoTime(new Date("2026-07-15T07:00:00Z")), { hour: 10, minute: 0 });
  assert.equal(isWithinSupportHours(new Date("2026-07-15T07:00:00Z")), true);
  assert.equal(isWithinSupportHours(new Date("2026-07-15T06:59:00Z")), false);
});

test("closing is exclusive at 22:00 Cairo time", () => {
  assert.equal(isWithinSupportHours(new Date("2026-01-15T19:59:00Z")), true, "21:59 Cairo");
  assert.equal(isWithinSupportHours(new Date("2026-01-15T20:00:00Z")), false, "22:00 Cairo");
  assert.equal(isWithinSupportHours(new Date("2026-07-15T19:00:00Z")), false, "22:00 Cairo (DST)");
});

test("every day of the week, including Friday and Saturday", () => {
  for (let day = 10; day <= 16; day++) {
    const noonCairo = new Date(`2026-01-${day}T10:00:00Z`); // 12:00 Cairo
    assert.equal(isWithinSupportHours(noonCairo), true, noonCairo.toISOString());
  }
});

/** Support & Help: three channels, each pointing at the destination the product already publishes. */

const channel = (id: string) => SUPPORT_CHANNELS.find((c) => c.id === id);

test("exactly three channels, in order: email, Discord, WhatsApp", () => {
  assert.deepEqual(SUPPORT_CHANNELS.map((c) => c.id), ["email", "discord", "whatsapp"]);
});

test("email opens the existing support address with mailto", () => {
  assert.equal(channel("email")?.href, `mailto:${SUPPORT_EMAIL}`);
  assert.equal(SUPPORT_EMAIL, "support@greenlightadvs.com");
  assert.equal(channel("email")?.external, false);
});

test("Discord opens the existing invite link, not an in-app ticket", () => {
  assert.equal(channel("discord")?.href, DISCORD_INVITE_URL);
  assert.match(DISCORD_INVITE_URL, /^https:\/\/discord\.gg\/[A-Za-z0-9]+$/);
  assert.equal(channel("discord")?.external, true);
});

test("WhatsApp opens the existing number as a wa.me link, digits only", () => {
  assert.equal(channel("whatsapp")?.href, WHATSAPP_URL);
  assert.equal(WHATSAPP_URL, `https://wa.me/${WHATSAPP_PHONE.replace(/\D/g, "")}`);
  assert.match(WHATSAPP_URL, /^https:\/\/wa\.me\/\d{8,15}$/);
  assert.equal(channel("whatsapp")?.external, true);
});

test("the support page defines no destination of its own", () => {
  const view = readFileSync(new URL("../components/views/SupportView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /mailto:[a-z]/i, "no hard-coded mail address");
  assert.doesNotMatch(view, /discord\.gg\//, "no hard-coded Discord link");
  assert.doesNotMatch(view, /wa\.me\//, "no hard-coded WhatsApp link");
  assert.match(view, /SUPPORT_CHANNELS\.map/);
});

test("every support string exists in all five dictionaries", () => {
  const keys = [
    "pageTitle", "pageDescription", "hoursTitle", "hours", "hoursNote",
    "emailTitle", "emailBody", "emailCta",
    "discordTitle", "discordBody", "discordCta",
    "whatsappTitle", "whatsappBody", "whatsappCta",
  ];
  for (const locale of ["en", "ar", "fr", "es", "de"]) {
    const dict = readFileSync(new URL(`./i18n/dictionaries/${locale}.ts`, import.meta.url), "utf8");
    const block = dict.slice(dict.indexOf("\n  support: {"), dict.indexOf("\n  },", dict.indexOf("\n  support: {")));
    for (const key of keys) assert.match(block, new RegExp(`\\n    ${key}: `), `${locale} lacks support.${key}`);
    assert.match(block, /Africa\/Cairo/, `${locale} hours name the zone`);
  }
});
