import type { OAuthPlatform } from "@/lib/types/database";

/**
 * Placeholder platforms with no registered OAuth app yet.
 *
 * Distinct from the §7.3 Analytics OAuth flow (YouTube/Instagram — real,
 * working connectors as of the oauth-connectors design, gated by
 * subscription tier, wired to media_kits.analytics_oauth_connected). This is
 * a forward-looking scaffold for whichever of these eventually gets a
 * client ID + secret — X and TikTok aren't even in the `Platform` enum, and
 * Twitch already has real self-reported-stats support unrelated to this, so
 * none of this touches that schema. Meta was removed from this list once
 * Instagram (its actual product in the `Platform` enum) got a real
 * connector — a separate "Meta" placeholder next to a working Instagram one
 * would just be confusing. Facebook is listed, though: Pages are a distinct
 * surface from Instagram with their own insights, not a second name for the
 * same connection, and the Settings connect list treats them separately.
 */
export const OAUTH_PLACEHOLDER_PLATFORMS = ["x", "tiktok", "twitch", "facebook"] as const;
export type OAuthPlaceholderPlatform = (typeof OAUTH_PLACEHOLDER_PLATFORMS)[number];

export const OAUTH_PLACEHOLDER_LABELS: Record<OAuthPlaceholderPlatform, string> = {
  x: "X (Twitter)",
  tiktok: "TikTok",
  twitch: "Twitch",
  facebook: "Facebook",
};

export function isOAuthPlaceholderPlatform(
  value: string,
): value is OAuthPlaceholderPlatform {
  return (OAUTH_PLACEHOLDER_PLATFORMS as readonly string[]).includes(value);
}

/**
 * The platforms with a registered OAuth app and a working
 * /api/oauth/<platform>/start -> /callback round trip (§7.3).
 *
 * Single source of truth: the start route, the callback, the media-kit
 * actions and every UI that offers a connect control all read this. It used
 * to be copy-pasted into five files, which is one edit away from a UI that
 * offers a connection the backend does not implement.
 */
export const REAL_OAUTH_PLATFORMS = ["youtube", "instagram"] as const satisfies
  readonly OAuthPlatform[];

export function isRealOAuthPlatform(value: string): value is OAuthPlatform {
  return (REAL_OAUTH_PLATFORMS as readonly string[]).includes(value);
}
