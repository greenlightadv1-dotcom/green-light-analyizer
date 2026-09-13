"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { toHandle } from "@/lib/alias";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchYoutubeChannelStats, fetchYoutubeRecentVideos } from "@/lib/youtube/client";
import { deleteOAuthConnection } from "@/lib/oauth/tokens";
import * as youtubeOAuth from "@/lib/oauth/youtube";
import * as instagramOAuth from "@/lib/oauth/instagram";
import { detectNiche as detectNicheWithAi } from "@/lib/ai/niche";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { Database, Platform, SocialLinks } from "@/lib/types/database";
import { parseCountryShares } from "./countries";
import { PLATFORMS, canAddConnection } from "./platforms";
import { isRealOAuthPlatform } from "@/lib/oauth/platforms";

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

  // Gated before the platform fetch, not just before the AI call: this action
  // also spends YouTube Data API or Instagram Graph quota on the way.
  const limit = await consumeRateLimit("ai_detect_niche", profile.id);
  if (!limit.allowed) return { error: limit.message, result: null };

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

export type CreatorProfileState = { error: string | null; saved: boolean };

const SOCIAL_KEYS = ["youtube", "instagram", "tiktok", "x", "twitch"] as const;
const MAX_ATTEMPTS = 5;

/**
 * Generates a short, URL-safe slug from a display name, appending a random
 * suffix on collision. Runs against the admin client because checking
 * another profile's shareable_slug for uniqueness needs a read RLS would
 * never grant a creator's own client (profiles_select is own-row-only) —
 * see 0003_rls_policies.sql.
 */
async function generateUniqueSlug(
  admin: SupabaseClient<Database>,
  fullName: string,
): Promise<string> {
  const base = toHandle(fullName);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("shareable_slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}${Date.now().toString(36)}`;
}

/**
 * Saves the Media Kit's "Creator Profile" layer (migration 0017) — bio,
 * avatar, country, language, base rate, social handles, and generates the
 * shareable slug on first save. Additive to §7's verified-audience model,
 * not a replacement: nothing here touches avg_views, engagement_rate,
 * declared/verified_top_countries or audience_verified.
 *
 * Runs against the admin client rather than the caller's own: the slug
 * uniqueness check needs a cross-profile read RLS does not grant (see
 * generateUniqueSlug above), and every column written here is already
 * scoped to `.eq("id", profile.id)` from requireProfile(), so there is no
 * path to touching a row that isn't the caller's own.
 */
export async function saveCreatorProfile(
  _prev: CreatorProfileState,
  formData: FormData,
): Promise<CreatorProfileState> {
  const profile = await requireProfile();

  const bio = String(formData.get("bio") ?? "").trim().slice(0, 1000) || null;
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim().slice(0, 100) || null;
  const primaryLanguage = String(formData.get("primary_language") ?? "").trim().slice(0, 100) || null;
  const baseRateRaw = String(formData.get("base_rate_usd") ?? "").trim();
  const baseRateUsd = baseRateRaw ? Number(baseRateRaw) : null;

  if (avatarUrl) {
    try {
      const url = new URL(avatarUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { error: "Avatar must be an http(s) link.", saved: false };
      }
    } catch {
      return { error: "Avatar must be a valid link.", saved: false };
    }
  }
  if (baseRateUsd !== null && (!Number.isFinite(baseRateUsd) || baseRateUsd < 0)) {
    return { error: "Base rate must be a non-negative, whole number.", saved: false };
  }

  const socialLinks: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const value = String(formData.get(`social_${key}`) ?? "").trim();
    if (value) socialLinks[key] = value.slice(0, 200);
  }

  const admin = createAdminClient();

  const shareableSlug = profile.shareable_slug ?? (await generateUniqueSlug(admin, profile.full_name));

  const { error } = await admin
    .from("profiles")
    .update({
      bio,
      avatar_url: avatarUrl,
      country,
      primary_language: primaryLanguage,
      base_rate_usd: baseRateUsd,
      social_links: Object.keys(socialLinks).length ? socialLinks : null,
      shareable_slug: shareableSlug,
    })
    .eq("id", profile.id);

  if (error) {
    return { error: "Those details could not be saved.", saved: false };
  }

  revalidatePath("/media-kit");
  revalidatePath("/dashboard");
  return { error: null, saved: true };
}
