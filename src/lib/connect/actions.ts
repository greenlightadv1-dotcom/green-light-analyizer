"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { CREATOR_ONLY_ERROR, canUseCreatorFeatures } from "@/lib/access";
import { accountConnectAvailable } from "@/lib/media-kit/platforms";
import { deleteOAuthConnection } from "@/lib/oauth/tokens";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isConnectPlatform } from "./providers";
import { credentials, fetchAccountStats, validAccessToken } from "./server";
import { clearAccountStats, writeAccountStats } from "./kit";

export type ConnectSyncState = { error: string | null; synced: boolean };

/**
 * "Sync now" for a connected Twitch, Kick or TikTok account (0042). Reads the
 * account with the stored token (refreshed if needed) and rewrites the counts.
 * The account id must still be the one that was connected: a token that now
 * answers for a different account is treated as a broken connection.
 */
export async function syncConnectedAccount(
  _prev: ConnectSyncState,
  formData: FormData,
): Promise<ConnectSyncState> {
  const profile = await requireProfile();
  if (!canUseCreatorFeatures(profile.role)) return { error: CREATOR_ONLY_ERROR, synced: false };

  const platform = String(formData.get("platform") ?? "");
  if (!isConnectPlatform(platform) || !accountConnectAvailable(platform)) {
    return { error: "mediaKit.connect.errors.unavailable", synced: false };
  }

  const limit = await consumeRateLimit("platform_sync", profile.id);
  if (!limit.allowed) return { error: limit.message, synced: false };

  const creds = credentials(platform);
  if (!creds) return { error: "mediaKit.connect.errors.unavailable", synced: false };

  const access = await validAccessToken(profile.id, platform, creds);
  if (!access) return { error: "mediaKit.connect.errors.reconnect", synced: false };

  const stats = await fetchAccountStats(platform, access.token, creds);
  if (!stats) return { error: "mediaKit.connect.errors.account", synced: false };
  if (access.externalId && stats.externalId !== access.externalId) {
    return { error: "mediaKit.connect.errors.reconnect", synced: false };
  }

  if (!(await writeAccountStats(profile.id, platform, stats))) {
    return { error: "mediaKit.connect.errors.save", synced: false };
  }

  revalidatePath("/media-kit");
  return { error: null, synced: true };
}

/** Removes the stored token and the synced counts; typed fields stay. */
export async function disconnectConnectedAccount(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!canUseCreatorFeatures(profile.role)) return;

  const platform = String(formData.get("platform") ?? "");
  if (!isConnectPlatform(platform)) return;

  await deleteOAuthConnection(profile.id, platform);
  await clearAccountStats(profile.id, platform);
  revalidatePath("/media-kit");
}
