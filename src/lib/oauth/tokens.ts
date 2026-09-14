import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { OAuthPlatform } from "@/lib/types/database";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  externalAccountId: string | null;
  scope: string | null;
};

/**
 * Reads and writes oauth_connections (migration 0015) — always through the
 * service-role client, since that table carries no RLS policy for
 * `authenticated` at all.
 */

export async function saveOAuthTokens(
  creatorId: string,
  platform: OAuthPlatform,
  tokens: StoredTokens,
): Promise<void> {
  const service = createAdminClient();
  await service.from("oauth_connections").upsert(
    {
      creator_id: creatorId,
      platform,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      external_account_id: tokens.externalAccountId,
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "creator_id,platform" },
  );
}

export async function getOAuthConnection(
  creatorId: string,
  platform: OAuthPlatform,
) {
  const service = createAdminClient();
  const { data } = await service
    .from("oauth_connections")
    .select("*")
    .eq("creator_id", creatorId)
    .eq("platform", platform)
    .maybeSingle();
  return data;
}

export async function deleteOAuthConnection(
  creatorId: string,
  platform: OAuthPlatform,
): Promise<void> {
  const service = createAdminClient();
  await service
    .from("oauth_connections")
    .delete()
    .eq("creator_id", creatorId)
    .eq("platform", platform);
}
