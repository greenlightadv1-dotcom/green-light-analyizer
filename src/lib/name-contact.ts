import { maskSensitiveData } from "./mask.ts";

/**
 * A display name is shown to the other side of a deal (the directory, the
 * deal room title), so it must not carry a way to reach the person off the
 * platform (§6). Same rule as the 0043 trigger on public.profiles: an email,
 * a phone number (seven or more digits, Arabic-Indic included), or a link or
 * messaging-app name. Pure — tested in name-contact.test.ts.
 */
const LINK = /(wa\.me|t\.me|discord\.gg|whatsapp|telegram|https?:\/\/|www\.)/i;

export function nameHasContact(name: string): boolean {
  if (/@/.test(name) || LINK.test(name)) return true;
  if ((name.match(/[0-9٠-٩۰-۹]/g) ?? []).length >= 7) return true;
  return maskSensitiveData(name).isMasked;
}
