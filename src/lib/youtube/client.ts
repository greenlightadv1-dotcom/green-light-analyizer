import "server-only";
import { meanEngagementRate } from "./engagement";

const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const PLAYLIST_ITEMS_ENDPOINT = "https://www.googleapis.com/youtube/v3/playlistItems";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const RECENT_VIDEO_COUNT = 10;

export type YoutubeChannelStats = {
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  /** Mean of (likes + comments) / views * 100 across the RECENT_VIDEO_COUNT most recent uploads. */
  engagementRate: number | null;
};

export type YoutubeRecentVideo = {
  title: string;
  description: string;
};

/**
 * YouTube Data API v3 client — all public data via an API key (§9), no
 * OAuth. `handle` is whatever a creator entered in platform_handle, with or
 * without a leading "@".
 *
 * Not verified against a live call: outbound access to Google's API is
 * blocked from the sandbox this was built in. Confirm the response shapes
 * against one real sync before relying on this.
 */

type ChannelLookup = {
  channelId: string;
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
  uploadsPlaylistId: string | null;
};

async function resolveChannel(
  key: string,
  handle: string,
): Promise<ChannelLookup | null> {
  const cleanHandle = handle.trim().replace(/^@/, "");
  if (!cleanHandle) return null;

  try {
    const url = `${CHANNELS_ENDPOINT}?part=statistics,contentDetails&forHandle=${encodeURIComponent(cleanHandle)}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const body: {
      items?: {
        id?: string;
        statistics?: ChannelLookup["statistics"];
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }[];
    } = await response.json();

    const item = body.items?.[0];
    if (!item?.id) return null;

    return {
      channelId: item.id,
      statistics: item.statistics,
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    };
  } catch {
    return null;
  }
}

/** Video IDs from the channel's uploads playlist, most recent first. */
async function fetchRecentVideoIds(
  key: string,
  uploadsPlaylistId: string,
): Promise<string[]> {
  try {
    const url = `${PLAYLIST_ITEMS_ENDPOINT}?part=contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${RECENT_VIDEO_COUNT}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];

    const body: { items?: { contentDetails?: { videoId?: string } }[] } =
      await response.json();

    return (body.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

type VideoDetails = {
  title?: string;
  description?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
};

/** statistics + snippet for a batch of video IDs, one call (max 50 IDs per YouTube's own limit). */
async function fetchVideoDetails(
  key: string,
  videoIds: string[],
): Promise<VideoDetails[]> {
  if (videoIds.length === 0) return [];

  try {
    const url = `${VIDEOS_ENDPOINT}?part=statistics,snippet&id=${videoIds.join(",")}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];

    const body: {
      items?: {
        snippet?: { title?: string; description?: string };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }[];
    } = await response.json();

    return (body.items ?? []).map((item) => ({
      title: item.snippet?.title,
      description: item.snippet?.description,
      viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined,
      likeCount: item.statistics?.likeCount ? Number(item.statistics.likeCount) : undefined,
      commentCount: item.statistics?.commentCount
        ? Number(item.statistics.commentCount)
        : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Channel-level stats plus a computed engagement rate: channels.list gives
 * subscriber/view/video counts directly, but engagement rate needs a
 * separate multi-call chain (playlistItems -> videos.list) since it isn't a
 * single field YouTube exposes — averaged as (likes+comments)/views across
 * each of the last RECENT_VIDEO_COUNT uploads individually, not computed
 * from summed totals, so one viral outlier can't dominate the number.
 */
export async function fetchYoutubeChannelStats(
  handle: string,
): Promise<YoutubeChannelStats | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const channel = await resolveChannel(key, handle);
  if (!channel) return null;

  let engagementRate: number | null = null;
  if (channel.uploadsPlaylistId) {
    const videoIds = await fetchRecentVideoIds(key, channel.uploadsPlaylistId);
    const videos = await fetchVideoDetails(key, videoIds);
    engagementRate = meanEngagementRate(videos);
  }

  return {
    subscriberCount: channel.statistics?.subscriberCount
      ? Number(channel.statistics.subscriberCount)
      : null,
    viewCount: channel.statistics?.viewCount ? Number(channel.statistics.viewCount) : null,
    videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null,
    engagementRate,
  };
}

/**
 * Titles + descriptions of the most recent uploads, for AI niche detection
 * (src/lib/ai/niche.ts). A separate call from fetchYoutubeChannelStats
 * because it's triggered by a different action at a different time ("Detect
 * niche" vs. "Sync from YouTube") — not worth coupling two independent user
 * actions just to share one channels.list call between them.
 */
export async function fetchYoutubeRecentVideos(
  handle: string,
): Promise<YoutubeRecentVideo[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const channel = await resolveChannel(key, handle);
  if (!channel?.uploadsPlaylistId) return null;

  const videoIds = await fetchRecentVideoIds(key, channel.uploadsPlaylistId);
  if (videoIds.length === 0) return null;

  const videos = await fetchVideoDetails(key, videoIds);
  const withTitles = videos.filter((v): v is VideoDetails & { title: string } =>
    Boolean(v.title),
  );
  if (withTitles.length === 0) return null;

  return withTitles.map((v) => ({
    title: v.title,
    description: v.description ?? "",
  }));
}
