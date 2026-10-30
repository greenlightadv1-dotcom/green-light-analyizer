import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { log } from "@/lib/log";
import { clearedVerifiedGeo, staleCleanupCutoff } from "@/lib/oauth/youtube-freshness";
import { getValidAccessToken } from "@/lib/oauth/youtube";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily YouTube API data upkeep (G1) — see lib/oauth/youtube-freshness.ts for
 * the policy text this implements.
 *
 * 1. Deletes verified geography older than STALE_CLEANUP_AFTER_MS (or with no
 *    sync time at all) from YouTube media kits. Only those columns.
 * 2. Re-confirms each stored YouTube token: getValidAccessToken refreshes an
 *    expired one, and a refresh Google answers with invalid_grant deletes that
 *    creator's token and verified geography. Any other failure (5xx, timeout,
 *    missing config) deletes nothing.
 *
 * Called by Vercel Cron (vercel.json) with `Authorization: Bearer
 * $CRON_SECRET`; without CRON_SECRET configured it refuses every request.
 * Excluded from the session proxy (proxy.ts) the same way webhooks are.
 */

export const maxDuration = 60;

/** Bounded per run; a daily run covers far more than the current creator count. */
const MAX_TOKEN_CHECKS = 200;
const TOKEN_CHECK_BUDGET_MS = 45_000;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const started = Date.now();
  const service = createAdminClient();
  const cutoff = staleCleanupCutoff(new Date(started));

  const { data: cleared, error: clearError } = await service
    .from("media_kits")
    .update(clearedVerifiedGeo({ disconnect: false }))
    .eq("platform", "youtube")
    .eq("audience_verified", true)
    .or(`verified_geo_synced_at.is.null,verified_geo_synced_at.lt.${cutoff}`)
    .select("id");
  if (clearError) log.error("youtube_freshness.stale_clear_failed", { error: clearError });

  const { data: connections, error: listError } = await service
    .from("oauth_connections")
    .select("creator_id")
    .eq("platform", "youtube")
    .order("updated_at", { ascending: true })
    .limit(MAX_TOKEN_CHECKS);
  if (listError) log.error("youtube_freshness.list_failed", { error: listError });

  let checked = 0;
  let unavailable = 0;
  for (const connection of connections ?? []) {
    if (Date.now() - started > TOKEN_CHECK_BUDGET_MS) break;
    const token = await getValidAccessToken(connection.creator_id);
    checked++;
    if (!token) unavailable++;
  }

  const summary = {
    stale_kits_cleared: cleared?.length ?? 0,
    tokens_checked: checked,
    tokens_unavailable: unavailable,
    tokens_pending: Math.max((connections?.length ?? 0) - checked, 0),
  };
  log.info("youtube_freshness.run", summary);
  return NextResponse.json(summary);
}
