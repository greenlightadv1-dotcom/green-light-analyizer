import type { Platform } from "@/lib/types/database";

/**
 * The §7.3 per-platform verification matrix, encoded.
 *
 * This is the honest core of the Media Kit: the product promises that nothing
 * is shown *as verified* unless it came from an official API, and for three of
 * the four platforms in the schema no such API exists. The UI reads this table
 * rather than offering a "Connect" button everywhere and failing later.
 */

export const PLATFORMS: Platform[] = ["youtube", "twitch", "kick", "instagram"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  instagram: "Instagram",
};

export type VerificationSupport = {
  /** Can verified_top_countries ever be populated for this platform? */
  supported: boolean;
  /** The API that would provide it, or why none can. */
  source: string;
  /** Shown in the UI so a creator understands why a platform has no badge. */
  note: string;
};

export const VERIFICATION_SUPPORT: Record<Platform, VerificationSupport> = {
  youtube: {
    supported: true,
    source: "YouTube Analytics API (yt-analytics.readonly)",
    note: "Viewer percentage by country, straight from YouTube. Requires your one-time consent.",
  },
  instagram: {
    supported: true,
    source: "Instagram Graph API insights",
    note: "Audience country breakdown. Needs a Business or Creator account linked to a Facebook Page.",
  },
  twitch: {
    supported: false,
    source: "none",
    note: "Twitch exposes no per-viewer country data to third-party apps, so audience geography here stays self-reported.",
  },
  kick: {
    supported: false,
    source: "none",
    note: "Kick has no official public API for audience demographics, so audience geography here stays self-reported.",
  },
};

/**
 * Integration status — the single source of truth for what each platform
 * actually does today (unified Creator Plan). The Pricing page, the Media Kit
 * and Settings' connection list all read this, so a platform can never be
 * advertised as working in one place while it is broken in another.
 *
 *   available      — implemented and operational: YouTube's public stats sync
 *                    and verified audience geography (YouTube Analytics OAuth)
 *   in_development — code exists but the integration is not operational:
 *                    Instagram, whose Meta app review is not complete, so its
 *                    Connect action is withheld rather than left to fail
 *   manual         — creators enter their own stats, labelled self-reported;
 *                    there is no live integration (Twitch, Kick)
 *   planned        — not built yet and not storable as a media kit (TikTok, X)
 *
 * Changing a status here is a product claim: only mark a platform
 * "available" once its integration works end to end.
 */
export type IntegrationStatus = "available" | "in_development" | "manual" | "planned";

export type IntegrationPlatform = Platform | "tiktok" | "x";

export const INTEGRATION_PLATFORMS: IntegrationPlatform[] = [
  "youtube",
  "instagram",
  "twitch",
  "kick",
  "tiktok",
  "x",
];

export const INTEGRATION_LABELS: Record<IntegrationPlatform, string> = {
  ...PLATFORM_LABELS,
  tiktok: "TikTok",
  x: "X",
};

export const INTEGRATION_STATUS: Record<IntegrationPlatform, IntegrationStatus> = {
  youtube: "available",
  instagram: "in_development",
  twitch: "manual",
  kick: "manual",
  tiktok: "planned",
  x: "planned",
};

/**
 * Connection ceiling — the same for every creator under the unified Creator
 * Plan, whatever plan value is still stored on the profile. It is
 * the number of platforms the media_kits schema accepts (four), the ceiling
 * the paid tiers already had; it is not "unlimited".
 */
export const MAX_CONNECTIONS = PLATFORMS.length;

/**
 * Whether a creator may add one more platform.
 *
 * `current` is how many kits they already have. Editing an existing kit is
 * always allowed — the limit is on connections, not on edits.
 */
export function canAddConnection(current: number): boolean {
  return current < MAX_CONNECTIONS;
}

/**
 * Whether the "Connect analytics" affordance should appear at all.
 *
 * Every creator is eligible; what decides it is the platform. It must expose
 * the data (§7.3) and its integration must actually be operational —
 * Instagram supports verified geography in principle, but while its
 * integration is in development the answer is "in-development", never a
 * Connect button that fails at the provider.
 */
export function verificationAvailability(
  platform: Platform,
): "available" | "in-development" | "unsupported" {
  if (!VERIFICATION_SUPPORT[platform].supported) return "unsupported";
  return INTEGRATION_STATUS[platform] === "available" ? "available" : "in-development";
}
