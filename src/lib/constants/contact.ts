/**
 * Support/access channels (§4.3, §8) — there is no in-app billing or
 * self-signup, so every "upgrade", "get access" or "open a ticket" CTA in the
 * product ultimately points here.
 */
export const DISCORD_INVITE_URL = "https://discord.gg/ejTySEFu3k";

export const WHATSAPP_PHONE = "+201041165669";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE.replace(/[^\d]/g, "")}`;
