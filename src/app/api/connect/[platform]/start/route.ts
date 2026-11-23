import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canUseCreatorFeatures } from "@/lib/access";
import { accountConnectAvailable } from "@/lib/media-kit/platforms";
import { buildAuthorizeUrl, isConnectPlatform, PROVIDERS } from "@/lib/connect/providers";
import { credentials } from "@/lib/connect/server";
import { pkceChallenge, pkceVerifierForState, signOAuthState } from "@/lib/oauth/state";

/**
 * Account connection, step 1 (Twitch, Kick, TikTok; migration 0042).
 *
 * Creator-only and only for a platform the operator switched on
 * (NEXT_PUBLIC_LIVE_CONNECTIONS) whose app credentials exist here. The signed
 * state names the creator and this platform, so it cannot complete another
 * platform's callback, and Kick's PKCE verifier is derived from it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  }

  const profile = await requireProfile();
  if (!canUseCreatorFeatures(profile.role)) {
    return NextResponse.json({ error: "Account connections are for creator accounts." }, { status: 403 });
  }
  if (!accountConnectAvailable(platform)) {
    return NextResponse.json({ error: `${platform} connections are not switched on yet.` }, { status: 403 });
  }

  const creds = credentials(platform);
  if (!creds) {
    return NextResponse.json({ error: `${platform} is not configured on this environment yet.` }, { status: 501 });
  }

  const state = signOAuthState(profile.id, `connect:${platform}`);
  const url = buildAuthorizeUrl(platform, {
    clientId: creds.clientId,
    redirectUri: creds.redirectUri,
    state,
    codeChallenge: PROVIDERS[platform].pkce ? pkceChallenge(pkceVerifierForState(state)) : undefined,
  });
  return NextResponse.redirect(url);
}
