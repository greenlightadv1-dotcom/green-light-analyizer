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
 * would just be confusing.
 */
export const OAUTH_PLACEHOLDER_PLATFORMS = ["x", "tiktok", "twitch"] as const;
export type OAuthPlaceholderPlatform = (typeof OAUTH_PLACEHOLDER_PLATFORMS)[number];

export const OAUTH_PLACEHOLDER_LABELS: Record<OAuthPlaceholderPlatform, string> = {
  x: "X (Twitter)",
  tiktok: "TikTok",
  twitch: "Twitch",
};

export function isOAuthPlaceholderPlatform(
  value: string,
): value is OAuthPlaceholderPlatform {
  return (OAUTH_PLACEHOLDER_PLATFORMS as readonly string[]).includes(value);
}
