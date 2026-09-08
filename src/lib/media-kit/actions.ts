"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchYoutubeChannelStats } from "@/lib/youtube/client";
import type { Platform } from "@/lib/types/database";
import { parseCountryShares } from "./countries";
import {
  PLATFORMS,
  canAddConnection,
  verificationAvailability,
} from "./platforms";

export type MediaKitState = {
  error: string | null;
  savedPlatform: Platform | null;
};

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Create or update the caller's kit for one platform (§7.1).
 *
 * Deliberately uses the *user's* Supabase client rather than the service role.
 * Everything written here is self-reported data a creator is entitled to
 * change, so it should travel the same path a creator's browser would and be
 * governed by the same RLS policies and column grants. If this ever tries to
 * write verified_top_countries or audience_verified, the database rejects it —
 * which is the point (§7.2).
 */
export async function saveMediaKit(
  _prev: MediaKitState,
  formData: FormData,
): Promise<MediaKitState> {
  const profile = await requireProfile();

  const platform = String(formData.get("platform") ?? "") as Platform;
  if (!PLATFORMS.includes(platform)) {
    return { error: "Unknown platform.", savedPlatform: null };
  }

  const parsed = parseCountryShares(
    String(formData.get("declared_top_countries") ?? ""),
  );
  if (!parsed.ok) {
    return { error: parsed.error, savedPlatform: null };
  }

  const engagement = num(formData, "engagement_rate");
  if (engagement !== null && engagement > 100) {
    return { error: "Engagement rate is a percentage.", savedPlatform: null };
  }

  const supabase = await createClient();

  // §8 connection limit. Editing an existing kit is always allowed — the limit
  // is on how many platforms are connected, not on correcting data already
  // entered, so a downgrade never strands a creator with uneditable rows.
  const { data: existing } = await supabase
    .from("media_kits")
    .select("id, platform")
    .eq("creator_id", profile.id);

  const isNew = !existing?.some((k) => k.platform === platform);
  const plan = profile.subscription_plan ?? "Starter";

  if (isNew && !canAddConnection(plan, existing?.length ?? 0)) {
    return {
      error: `The ${plan} plan covers ${existing?.length ?? 0} platform connections. Upgrade over Discord to add more.`,
      savedPlatform: null,
    };
  }

  const { error } = await supabase.from("media_kits").upsert(
    {
      creator_id: profile.id,
      platform,
      platform_handle: String(formData.get("platform_handle") ?? "").trim() || null,
      avg_views: num(formData, "avg_views"),
      avg_ccv: num(formData, "avg_ccv"),
      engagement_rate: engagement,
      content_category:
        String(formData.get("content_category") ?? "").trim() || null,
      content_language:
        String(formData.get("content_language") ?? "").trim() || null,
      declared_top_countries: parsed.value.length ? parsed.value : null,
    },
    { onConflict: "creator_id,platform" },
  );

  if (error) {
    return { error: "Those details could not be saved.", savedPlatform: null };
  }

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
  return { error: null, savedPlatform: platform };
}

/**
 * Disconnect an analytics connection — CLAUDE.md §12.
 *
 * "Disconnecting must immediately set audience_verified = false and clear
 *  verified_top_countries."
 *
 * Immediately, in one statement, not on the next sync. A creator who revokes
 * consent and still sees a verified badge on their profile has been told a lie
 * about their own data, and a sponsor reading it has been told one too.
 *
 * Runs as service_role because those three columns are withheld from
 * `authenticated` by design — the same grant that stops a creator *setting*
 * the badge also stops them clearing it, so the server does both.
 */
export async function disconnectAnalytics(formData: FormData): Promise<void> {
  const profile = await requireProfile();

  const platform = String(formData.get("platform") ?? "") as Platform;
  if (!PLATFORMS.includes(platform)) return;

  const service = createAdminClient();
  await service
    .from("media_kits")
    .update({
      audience_verified: false,
      verified_top_countries: null,
      analytics_oauth_connected: false,
      last_synced_at: new Date().toISOString(),
    })
    .eq("creator_id", profile.id)
    .eq("platform", platform);

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
}

/**
 * Begin the §7.3 OAuth handshake.
 *
 * NOT IMPLEMENTED, and deliberately fails loudly rather than pretending.
 * Completing this needs credentials that do not exist yet:
 *
 *   YouTube   — a Google Cloud project, the yt-analytics.readonly scope, and a
 *               verified OAuth consent screen. Sensitive scope: review takes
 *               days-to-weeks, but NOT a CASA audit (§7.3).
 *   Instagram — a Meta app through App Review for instagram_manage_insights,
 *               plus a Business/Creator account linked to a Facebook Page.
 *
 * Both also need token storage and refresh handling. Until then the page shows
 * the connection as unavailable and says why, rather than offering a button
 * that dead-ends.
 */
export async function connectAnalytics(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  const platform = String(formData.get("platform") ?? "") as Platform;

  if (!PLATFORMS.includes(platform)) return;

  const availability = verificationAvailability(
    platform,
    profile.subscription_plan ?? "Starter",
  );
  if (availability !== "available") return;

  // No provider credentials are configured, so there is nothing to redirect to.
  // Returning silently would look like a broken button; this is a real state.
  throw new Error(
    `Analytics OAuth for ${platform} is not configured on this environment yet.`,
  );
}

export type SyncYoutubeState = {
  error: string | null;
  synced: boolean;
};

/**
 * "Sync from YouTube" — channel-level stats via the YouTube Data API v3
 * (§9), distinct from the §7.3 Analytics OAuth flow above: this is a public,
 * API-key-only lookup (no consent screen, no token storage), so it's viable
 * today rather than blocked on OAuth review.
 *
 * subscriber_count/channel_view_count are withheld from `authenticated`'s
 * column grant (same as verified_top_countries), so this always writes
 * through the service-role client — never through the caller's own,
 * regardless of who is calling.
 */
export async function syncYoutubeStats(
  _prev: SyncYoutubeState,
  formData: FormData,
): Promise<SyncYoutubeState> {
  const profile = await requireProfile();

  const mediaKitId = String(formData.get("media_kit_id") ?? "");
  if (!mediaKitId) return { error: "Missing media kit.", synced: false };

  // Caller's own client: RLS already scopes this to a kit the caller may
  // read, and the ownership + platform check below is the real gate before
  // any API call or write happens.
  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("media_kits")
    .select("id, creator_id, platform, platform_handle")
    .eq("id", mediaKitId)
    .single();

  if (!kit || kit.creator_id !== profile.id || kit.platform !== "youtube") {
    return { error: "That media kit could not be found.", synced: false };
  }
  if (!kit.platform_handle) {
    return {
      error: "Add your channel handle above before syncing.",
      synced: false,
    };
  }

  const stats = await fetchYoutubeChannelStats(kit.platform_handle);
  if (!stats) {
    return {
      error:
        "Could not reach YouTube — check the handle, and that YOUTUBE_API_KEY is configured.",
      synced: false,
    };
  }

  const service = createAdminClient();
  const { error } = await service
    .from("media_kits")
    .update({
      subscriber_count: stats.subscriberCount,
      channel_view_count: stats.viewCount,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", mediaKitId);

  if (error) {
    return { error: "Fetched from YouTube but could not save.", synced: false };
  }

  revalidatePath("/media-kit");
  return { error: null, synced: true };
}
