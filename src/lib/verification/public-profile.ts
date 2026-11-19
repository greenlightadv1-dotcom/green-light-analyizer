import type { SocialLinks } from "../types/database.ts";

/**
 * Which application fields become public on the profile at activation. Pure,
 * tested in public-profile.test.ts. Only the main platform's handle and the
 * categories are carried; legal name, date of birth, nationality and the
 * WhatsApp number stay in the private verification case.
 */
const SOCIAL_KEYS = ["youtube", "instagram", "tiktok", "x", "twitch"] as const satisfies readonly (keyof SocialLinks)[];

export function publicProfileFromDetails(details: Record<string, string>): { socialLinks: SocialLinks | null; categories: string[] } {
  const platform = details.main_platform as (typeof SOCIAL_KEYS)[number];
  const handle = details.handle?.trim();
  const socialLinks = handle && (SOCIAL_KEYS as readonly string[]).includes(platform) ? { [platform]: handle.startsWith("@") ? handle : `@${handle}` } : null;
  const categories = (details.categories ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return { socialLinks, categories };
}
