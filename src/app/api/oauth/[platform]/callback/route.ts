import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOAuthPlaceholderPlatform } from "@/lib/oauth/platforms";
import { verifyOAuthState } from "@/lib/oauth/state";
import { saveOAuthTokens } from "@/lib/oauth/tokens";
import * as youtube from "@/lib/oauth/youtube";
import * as instagram from "@/lib/oauth/instagram";
import type { OAuthPlatform } from "@/lib/types/database";

const REAL_OAUTH_PLATFORMS = ["youtube", "instagram"] as const;

function isRealOAuthPlatform(value: string): value is OAuthPlatform {
  return (REAL_OAUTH_PLATFORMS as readonly string[]).includes(value);
}

/**
 * OAuth callback — completes what start/route.ts began.
 *
 * Every failure path redirects back to /media-kit with an error query param
 * rather than a raw error page: the creator is mid-flow from an external
 * site, and a dead end here reads as "the whole feature is broken" even when
 * only one step is (an unregistered app, an expired code, a stale state).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const failureUrl = new URL("/media-kit", request.url);

  if (!isRealOAuthPlatform(platform)) {
    if (!isOAuthPlaceholderPlatform(platform)) {
      return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
    }
    return NextResponse.json(
      { error: `${platform} is not configured on this environment yet.` },
      { status: 501 },
    );
  }

  const profile = await requireProfile();

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError || !code || !state || !verifyOAuthState(state, profile.id)) {
    failureUrl.searchParams.set("oauth_error", platform);
    return NextResponse.redirect(failureUrl);
  }

  const tokens =
    platform === "youtube"
      ? await youtube.exchangeCodeForTokens(code)
      : await instagram.exchangeCodeForTokens(code);

  if (!tokens) {
    failureUrl.searchParams.set("oauth_error", platform);
    return NextResponse.redirect(failureUrl);
  }

  const externalAccountId =
    platform === "youtube"
      ? await youtube.resolveChannelId(tokens.access_token)
      : await instagram.resolveInstagramBusinessAccountId(tokens.access_token);

  if (!externalAccountId) {
    failureUrl.searchParams.set("oauth_error", platform);
    return NextResponse.redirect(failureUrl);
  }

  // Google tokens are short-lived with a refresh_token; Meta's are already
  // long-lived with no refresh_token — see instagram.ts's getValidAccessToken
  // doc comment. Falling back to a generous 60-day window covers that case
  // without the callback needing to know the difference. Known by `platform`
  // rather than a structural `in` check on the union, which TS can't narrow
  // cleanly here since the two token shapes only differ by optional fields.
  const isGoogleToken = platform === "youtube";
  const expiresInSeconds =
    isGoogleToken && typeof tokens.expires_in === "number"
      ? tokens.expires_in
      : 60 * 24 * 60 * 60;

  await saveOAuthTokens(profile.id, platform, {
    accessToken: tokens.access_token,
    refreshToken: isGoogleToken
      ? ((tokens as { refresh_token?: string }).refresh_token ?? null)
      : null,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    externalAccountId,
    scope: isGoogleToken
      ? ((tokens as { scope?: string }).scope ?? null)
      : null,
  });

  const service = createAdminClient();
  await service.from("media_kits").upsert(
    {
      creator_id: profile.id,
      platform,
      analytics_oauth_connected: true,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "creator_id,platform" },
  );

  const successUrl = new URL("/media-kit", request.url);
  successUrl.searchParams.set("oauth_connected", platform);
  return NextResponse.redirect(successUrl);
}
