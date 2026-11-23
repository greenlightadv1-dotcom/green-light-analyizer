import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canUseCreatorFeatures } from "@/lib/access";
import { accountConnectAvailable } from "@/lib/media-kit/platforms";
import { expiresAtIso, isConnectPlatform, PROVIDERS } from "@/lib/connect/providers";
import { credentials, exchangeCode, fetchAccountStats } from "@/lib/connect/server";
import { connectedElsewhere, writeAccountStats } from "@/lib/connect/kit";
import { pkceVerifierForState, verifyOAuthState } from "@/lib/oauth/state";
import { saveOAuthTokens } from "@/lib/oauth/tokens";
import { log } from "@/lib/log";

/**
 * Account connection, step 2. Every failure redirects back to the Media Kit
 * with `connect_error=<platform>:<reason>`, never a raw error page: the
 * creator is mid-flow from another site.
 *
 * Nothing is stored until the account itself has been read with the new
 * token, so a token that cannot sync is never saved, and an account already
 * connected to another Green Light creator is refused.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  }

  const fail = (reason: string) => {
    const url = new URL("/media-kit", request.url);
    url.searchParams.set("connect_error", `${platform}:${reason}`);
    return NextResponse.redirect(url);
  };

  const profile = await requireProfile();
  if (!canUseCreatorFeatures(profile.role) || !accountConnectAvailable(platform)) return fail("unavailable");

  const creds = credentials(platform);
  if (!creds) return fail("unavailable");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (request.nextUrl.searchParams.get("error")) return fail("denied");
  if (!code || !state || !verifyOAuthState(state, profile.id, `connect:${platform}`)) return fail("state");

  const token = await exchangeCode(
    platform,
    creds,
    code,
    PROVIDERS[platform].pkce ? pkceVerifierForState(state) : undefined,
  );
  if (!token) return fail("token");

  const stats = await fetchAccountStats(platform, token.accessToken, creds);
  if (!stats) {
    log.warn("connect.account_unreadable", { platform });
    return fail("account");
  }

  if (await connectedElsewhere(platform, stats.externalId, profile.id)) {
    log.warn("connect.account_already_linked", { platform });
    return fail("taken");
  }

  await saveOAuthTokens(profile.id, platform, {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: expiresAtIso(token.expiresIn),
    externalAccountId: stats.externalId,
    scope: token.scope,
  });

  if (!(await writeAccountStats(profile.id, platform, stats))) return fail("save");

  const url = new URL("/media-kit", request.url);
  url.searchParams.set("account_connected", platform);
  return NextResponse.redirect(url);
}
