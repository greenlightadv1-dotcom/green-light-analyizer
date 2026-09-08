"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchYoutubeChannelStats, fetchYoutubeRecentVideos } from "@/lib/youtube/client";
import { deleteOAuthConnection } from "@/lib/oauth/tokens";
import * as youtubeOAuth from "@/lib/oauth/youtube";
import * as instagramOAuth from "@/lib/oauth/instagram";
import { detectNiche as detectNicheWithAi } from "@/lib/ai/niche";
import type { OAuthPlatform, Platform } from "@/lib/types/database";
import { parseCountryShares } from "./countries";
import {
  PLATFORMS,
  canAddConnection,
  verificationAvailability,
} from "./platforms";

const REAL_OAUTH_PLATFORMS = ["youtube", "instagram"] as const;
function isRealOAuthPlatform(value: string): value is OAuthPlatform {
  return (REAL_OAUTH_PLATFORMS as readonly string[]).includes(value);
}

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
 *
 * Also deletes the stored OAuth tokens (oauth_connections) for youtube/
 * instagram, if any — the point of disconnecting is that the platform no
 * longer has standing access, so the credential that would grant it again on
 * the next sync has to go too, not just the badge on this record.
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

  if (isRealOAuthPlatform(platform)) {
    await deleteOAuthConnection(profile.id, platform);
  }

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
}

/**
 * Begin the §7.3 OAuth handshake for youtube/instagram — everything else
 * still fails loudly rather than pretending, since no credentials exist for
 * those platforms yet (see src/lib/oauth/platforms.ts).
 *
 * The actual redirect-to-provider logic lives in
 * /api/oauth/[platform]/start, not here: a Server Action can redirect, but
 * the OAuth flow is naturally a GET-navigable URL (the provider redirects
 * back to a GET callback), so the route handler is the more direct fit and
 * this action's whole job is just sending the browser there.
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

  if (isRealOAuthPlatform(platform)) {
    redirect(`/api/oauth/${platform}/start`);
  }

  // No provider credentials are configured for this platform, and no start
  // route exists for it that could redirect anywhere real. Returning
  // silently would look like a broken button; this is a real state.
  throw new Error(
    `Analytics OAuth for ${platform} is not configured on this environment yet.`,
  );
}

export type SyncVerifiedGeoState = {
  error: string | null;
  synced: boolean;
};

/**
 * "Sync verified geography" — pulls audience-country data through an
 * already-established youtube/instagram OAuth connection and writes it into
 * verified_top_countries + audience_verified (§7.2). Distinct from
 * syncYoutubeStats below: that one is public channel-level stats via an API
 * key, this one is per-viewer audience geography that only exists behind
 * OAuth consent.
 */
export async function syncVerifiedGeo(
  _prev: SyncVerifiedGeoState,
  formData: FormData,
): Promise<SyncVerifiedGeoState> {
  const profile = await requireProfile();

  const platform = String(formData.get("platform") ?? "");
  if (!isRealOAuthPlatform(platform)) {
    return { error: "Unsupported platform.", synced: false };
  }

  const accessToken =
    platform === "youtube"
      ? await youtubeOAuth.getValidAccessToken(profile.id)
      : await instagramOAuth.getValidAccessToken(profile.id);

  if (!accessToken) {
    return {
      error: "Your connection has expired or is missing — reconnect above.",
      synced: false,
    };
  }

  const service = createAdminClient();
  const { data: connection } = await service
    .from("oauth_connections")
    .select("external_account_id")
    .eq("creator_id", profile.id)
    .eq("platform", platform)
    .maybeSingle();

  if (!connection?.external_account_id) {
    return { error: "Reconnect above to sync.", synced: false };
  }

  const countries =
    platform === "youtube"
      ? await youtubeOAuth.fetchAudienceCountries(
          accessToken,
          connection.external_account_id,
        )
      : await instagramOAuth.fetchAudienceCountries(
          accessToken,
          connection.external_account_id,
        );

  if (!countries) {
    return {
      error: `Could not reach ${platform === "youtube" ? "YouTube Analytics" : "Instagram"} — try again shortly.`,
      synced: false,
    };
  }

  const { error } = await service
    .from("media_kits")
    .update({
      verified_top_countries: countries,
      audience_verified: true,
      last_synced_at: new Date().toISOString(),
    })
    .eq("creator_id", profile.id)
    .eq("platform", platform);

  if (error) {
    return { error: "Fetched but could not save.", synced: false };
  }

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
  return { error: null, synced: true };
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
 * subscriber_count/channel_view_count/media_count are withheld from
 * `authenticated`'s column grant (same as verified_top_countries), so this
 * always writes through the service-role client — never through the
 * caller's own, regardless of who is calling. engagement_rate has no such
 * grant restriction (a creator can already set it manually), but is written
 * the same way here for one consistent code path; overwriting the
 * creator's own manually-entered value is the point of this sync, not an
 * accident — the button is explicitly "Sync from YouTube", not "Add to".
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
      media_count: stats.videoCount,
      // Only overwrite if a rate could actually be computed (needs at least
      // one recent video with views) — a temporary computation failure
      // should never silently blank out a value the creator already set.
      ...(stats.engagementRate !== null && { engagement_rate: stats.engagementRate }),
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", mediaKitId);

  if (error) {
    return { error: "Fetched from YouTube but could not save.", synced: false };
  }

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
  return { error: null, synced: true };
}

export type SyncInstagramState = {
  error: string | null;
  synced: boolean;
};

/**
 * "Sync from Instagram" — follower/media counts via the Business Account's
 * own fields, through the already-established §7.3 OAuth connection (there
 * is no API-key-only public path for Instagram the way there is for
 * YouTube's Data API, so this needs the same token syncVerifiedGeo uses).
 */
export async function syncInstagramStats(
  _prev: SyncInstagramState,
  _formData: FormData,
): Promise<SyncInstagramState> {
  const profile = await requireProfile();

  const accessToken = await instagramOAuth.getValidAccessToken(profile.id);
  if (!accessToken) {
    return {
      error: "Your connection has expired or is missing — reconnect above.",
      synced: false,
    };
  }

  const service = createAdminClient();
  const { data: connection } = await service
    .from("oauth_connections")
    .select("external_account_id")
    .eq("creator_id", profile.id)
    .eq("platform", "instagram")
    .maybeSingle();

  if (!connection?.external_account_id) {
    return { error: "Reconnect above to sync.", synced: false };
  }

  const metrics = await instagramOAuth.fetchBasicMetrics(
    accessToken,
    connection.external_account_id,
  );
  if (!metrics) {
    return { error: "Could not reach Instagram — try again shortly.", synced: false };
  }

  const { error } = await service
    .from("media_kits")
    .update({
      subscriber_count: metrics.followersCount,
      media_count: metrics.mediaCount,
      last_synced_at: new Date().toISOString(),
    })
    .eq("creator_id", profile.id)
    .eq("platform", "instagram");

  if (error) {
    return { error: "Fetched from Instagram but could not save.", synced: false };
  }

  revalidatePath("/media-kit");
  return { error: null, synced: true };
}

export type DetectNicheState = {
  error: string | null;
  result: { category: string; tags: string[] } | null;
};

/**
 * "Detect niche" — AI classification of a creator's own recent video/post
 * titles, descriptions and captions (§9 extension; see the §12 scope note
 * in src/lib/ai/niche.ts for why this is a different use than deal
 * evaluation). Overwrites content_category directly and adds content_tags —
 * see the migration 0016 comment for why neither is a new "verified" field.
 *
 * YouTube: public API-key lookup, needs only platform_handle. Instagram:
 * needs the §7.3 OAuth connection, since captions aren't public data.
 */
export async function detectNiche(
  _prev: DetectNicheState,
  formData: FormData,
): Promise<DetectNicheState> {
  const profile = await requireProfile();

  const mediaKitId = String(formData.get("media_kit_id") ?? "");
  if (!mediaKitId) return { error: "Missing media kit.", result: null };

  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("media_kits")
    .select("id, creator_id, platform, platform_handle")
    .eq("id", mediaKitId)
    .single();

  if (!kit || kit.creator_id !== profile.id) {
    return { error: "That media kit could not be found.", result: null };
  }

  let items: string[] = [];
  if (kit.platform === "youtube") {
    if (!kit.platform_handle) {
      return {
        error: "Add your channel handle above before detecting your niche.",
        result: null,
      };
    }
    const videos = await fetchYoutubeRecentVideos(kit.platform_handle);
    if (!videos) {
      return {
        error: "Could not fetch recent videos — check the handle and YOUTUBE_API_KEY.",
        result: null,
      };
    }
    items = videos.map((v) => `${v.title}\n${v.description}`);
  } else if (kit.platform === "instagram") {
    const accessToken = await instagramOAuth.getValidAccessToken(profile.id);
    if (!accessToken) {
      return { error: "Reconnect Instagram above to detect your niche.", result: null };
    }
    const service = createAdminClient();
    const { data: connection } = await service
      .from("oauth_connections")
      .select("external_account_id")
      .eq("creator_id", profile.id)
      .eq("platform", "instagram")
      .maybeSingle();
    if (!connection?.external_account_id) {
      return { error: "Reconnect Instagram above to detect your niche.", result: null };
    }
    const posts = await instagramOAuth.fetchRecentCaptions(
      accessToken,
      connection.external_account_id,
    );
    if (!posts) {
      return { error: "Could not fetch recent posts — try again shortly.", result: null };
    }
    items = posts.map((p) => p.caption);
  } else {
    return {
      error: "Niche detection is only available for YouTube and Instagram right now.",
      result: null,
    };
  }

  const niche = await detectNicheWithAi(items);
  if (!niche) {
    return {
      error: "Could not detect a niche — check that NVIDIA_API_KEY is configured.",
      result: null,
    };
  }

  const service = createAdminClient();
  const { error } = await service
    .from("media_kits")
    .update({ content_category: niche.category, content_tags: niche.tags })
    .eq("id", mediaKitId);

  if (error) {
    return { error: "Detected but could not save.", result: null };
  }

  revalidatePath("/media-kit");
  revalidatePath("/analyzer");
  return { error: null, result: niche };
}
