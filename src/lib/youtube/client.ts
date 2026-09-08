import "server-only";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";

export type YoutubeChannelStats = {
  subscriberCount: number | null;
  viewCount: number | null;
};

/**
 * YouTube Data API v3, channels.list?part=statistics.
 *
 * `handle` is whatever a creator entered in platform_handle (§9) — with or
 * without a leading "@". Tries the modern forHandle lookup first, since
 * that's what a creator is most likely to have entered; a bare channel ID
 * would also work here since the API accepts both interchangeably as long
 * as the right parameter is used, but forHandle covers the common case.
 *
 * Returns null on any failure (no key, handle not found, network error) —
 * never a half-filled result. Not verified against a live call: outbound
 * access to Google's API is blocked from the sandbox this was built in.
 * Confirm the response shape against one real sync before relying on it.
 */
export async function fetchYoutubeChannelStats(
  handle: string,
): Promise<YoutubeChannelStats | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const cleanHandle = handle.trim().replace(/^@/, "");
  if (!key || !cleanHandle) return null;

  try {
    const url = `${ENDPOINT}?part=statistics&forHandle=${encodeURIComponent(cleanHandle)}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const body: {
      items?: { statistics?: { subscriberCount?: string; viewCount?: string } }[];
    } = await response.json();

    const stats = body.items?.[0]?.statistics;
    if (!stats) return null;

    return {
      subscriberCount: stats.subscriberCount ? Number(stats.subscriberCount) : null,
      viewCount: stats.viewCount ? Number(stats.viewCount) : null,
    };
  } catch {
    return null;
  }
}
