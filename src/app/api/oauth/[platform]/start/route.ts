import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canUseCreatorFeatures } from "@/lib/access";
import {
  isOAuthPlaceholderPlatform,
  isRealOAuthPlatform,
} from "@/lib/oauth/platforms";
import { signOAuthState } from "@/lib/oauth/state";
import { verificationAvailability } from "@/lib/media-kit/platforms";
import * as youtube from "@/lib/oauth/youtube";
import * as instagram from "@/lib/oauth/instagram";

/**
 * OAuth entry point.
 *
 * youtube/instagram get real logic (§7.3): re-checks the caller is signed in,
 * is a creator (or admin), and that the platform's integration is
 * operational (media-kit/platforms.ts INTEGRATION_STATUS), signs a CSRF
 * state, and redirects to the provider's real authorization URL — or a 501
 * if the client ID isn't configured yet, which is expected until the app is
 * registered (see the oauth-connectors design doc).
 *
 * Everything else stays a placeholder — see src/lib/oauth/platforms.ts —
 * returning 501 rather than attempting a redirect there is no client ID
 * for.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

  if (isRealOAuthPlatform(platform)) {
    const profile = await requireProfile();

    // Creator-only, on the server. Under the unified Creator Plan the stored
    // plan no longer decides this, so the role must — otherwise a company
    // account could start a verified-geography connection (lib/access.ts).
    if (!canUseCreatorFeatures(profile.role)) {
      return NextResponse.json(
        { error: "Verified audience geography is only available to creator accounts." },
        { status: 403 },
      );
    }

    // Every creator is eligible; the platform's integration has to be
    // operational. Instagram is in development, so it is refused here rather
    // than sent to a provider flow that cannot complete.
    if (verificationAvailability(platform) !== "available") {
      return NextResponse.json(
        { error: `${platform} verified audience geography is still in development.` },
        { status: 403 },
      );
    }

    const state = signOAuthState(profile.id);
    const authorizationUrl =
      platform === "youtube"
        ? youtube.buildAuthorizationUrl(state)
        : instagram.buildAuthorizationUrl(state);

    if (!authorizationUrl) {
      return NextResponse.json(
        { error: `${platform} OAuth is not configured on this environment yet.` },
        { status: 501 },
      );
    }

    return NextResponse.redirect(authorizationUrl);
  }

  if (!isOAuthPlaceholderPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  }

  return NextResponse.json(
    { error: `${platform} is not configured on this environment yet.` },
    { status: 501 },
  );
}
