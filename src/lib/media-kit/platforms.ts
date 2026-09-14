import type { Platform, SubscriptionPlan } from "@/lib/types/database";

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
 * §8 tier limits.
 *
 * Starter gets 2 platform connections and no verified audience geography; Pro
 * and Elite get every platform in the schema plus the opt-in OAuth analytics
 * connections. Verified geo is gated deliberately — §7.3 notes the OAuth review
 * lead time, and keeping it paid means an MVP launch never blocks on Google or
 * Meta turnaround.
 */
export const MAX_CONNECTIONS: Record<SubscriptionPlan, number> = {
  Starter: 2,
  Pro: PLATFORMS.length,
  Elite: PLATFORMS.length,
};

export function canVerifyAudience(plan: SubscriptionPlan): boolean {
  return plan === "Pro" || plan === "Elite";
}

export function maxConnections(plan: SubscriptionPlan): number {
  return MAX_CONNECTIONS[plan];
}

/**
 * Whether a creator may add one more platform.
 *
 * `current` is how many kits they already have. Editing an existing kit is
 * always allowed — the limit is on connections, not on edits, so a creator who
 * downgrades never loses the ability to correct data they already entered.
 */
export function canAddConnection(
  plan: SubscriptionPlan,
  current: number,
): boolean {
  return current < maxConnections(plan);
}

/**
 * Whether the "Connect analytics" affordance should appear at all.
 *
 * Both halves must hold: the platform has to expose the data (§7.3) and the
 * plan has to include it (§8). Failing either, the UI says which one — a
 * creator on Starter looking at Twitch should not be told to upgrade for
 * something upgrading cannot deliver.
 */
export function verificationAvailability(
  platform: Platform,
  plan: SubscriptionPlan,
): "available" | "needs-upgrade" | "unsupported" {
  if (!VERIFICATION_SUPPORT[platform].supported) return "unsupported";
  return canVerifyAudience(plan) ? "available" : "needs-upgrade";
}
