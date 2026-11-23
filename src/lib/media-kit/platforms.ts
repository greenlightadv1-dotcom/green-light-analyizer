import type { Platform } from "@/lib/types/database";

/**
 * The §7.3 per-platform verification matrix, encoded.
 *
 * This is the honest core of the Media Kit: the product promises that nothing
 * is shown *as verified* unless it came from an official API, and for three of
 * the four platforms in the schema no such API exists. The UI reads this table
 * rather than offering a "Connect" button everywhere and failing later.
 */

export const PLATFORMS: Platform[] = ["youtube", "twitch", "kick", "instagram", "tiktok"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  instagram: "Instagram",
  tiktok: "TikTok",
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
    note: "Kick's official API exposes no audience demographics, so audience geography here stays self-reported.",
  },
  tiktok: {
    supported: false,
    source: "none",
    note: "TikTok's Display API exposes no audience demographics, so audience geography here stays self-reported.",
  },
};

/**
 * Integration status — the single source of truth for what each platform
 * actually does today (unified Creator Plan). The Pricing page, the Media Kit
 * and Settings' connection list all read this, so a platform can never be
 * advertised as working in one place while it is broken in another.
 *
 *   available      — implemented and operational: YouTube's public stats sync
 *                    and verified audience geography (YouTube Analytics OAuth);
 *                    Twitch, Kick and TikTok once their account connection is
 *                    switched on (see liveConnections below)
 *   in_development — code exists but the integration is not operational:
 *                    Instagram, whose Meta app review is not complete, so its
 *                    Connect action is withheld rather than left to fail
 *   manual         — creators enter their own stats, labelled self-reported;
 *                    there is no live integration (Twitch, Kick, TikTok until
 *                    switched on)
 *   planned        — not built yet and not storable as a media kit (X)
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
  x: "X",
};

/**
 * Integrations the operator has switched on, from NEXT_PUBLIC_LIVE_CONNECTIONS
 * (comma-separated: instagram, twitch, kick, tiktok). It is a build-time public
 * value because the Pricing page and the Media Kit render on the client.
 *
 * Built and switched on are different things: Twitch, Kick and TikTok
 * connections (0042) and the Instagram connector are in the code, but each
 * needs a registered app, and Instagram and TikTok also need the platform's
 * app review. Until the operator lists a platform here it is not offered, so
 * the product never shows a Connect button that fails at the provider. The
 * server routes check the platform's credentials as well.
 */
export function liveConnections(raw: string | undefined): Set<IntegrationPlatform> {
  const allowed = new Set<IntegrationPlatform>(["instagram", "twitch", "kick", "tiktok"]);
  return new Set(
    (raw ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is IntegrationPlatform => allowed.has(p as IntegrationPlatform)),
  );
}

export function integrationStatusFor(
  live: Set<IntegrationPlatform>,
): Record<IntegrationPlatform, IntegrationStatus> {
  return {
    youtube: "available",
    instagram: live.has("instagram") ? "available" : "in_development",
    twitch: live.has("twitch") ? "available" : "manual",
    kick: live.has("kick") ? "available" : "manual",
    tiktok: live.has("tiktok") ? "available" : "manual",
    x: "planned",
  };
}

export const INTEGRATION_STATUS: Record<IntegrationPlatform, IntegrationStatus> =
  integrationStatusFor(liveConnections(process.env.NEXT_PUBLIC_LIVE_CONNECTIONS));

/** Twitch, Kick and TikTok: the account connection (0042) is switched on. */
export function accountConnectAvailable(platform: Platform): boolean {
  return (
    (platform === "twitch" || platform === "kick" || platform === "tiktok") &&
    INTEGRATION_STATUS[platform] === "available"
  );
}

/**
 * Connection ceiling — the same for every creator under the unified Creator
 * Plan, whatever plan value is still stored on the profile. It is
 * the number of platforms the media_kits schema accepts (five since 0042 added
 * TikTok); it is not "unlimited".
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
