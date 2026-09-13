import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
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
 * youtube/instagram get real logic (§7.3): re-checks the caller is signed in
 * and that their plan actually includes verified geography, signs a CSRF
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

    const availability = verificationAvailability(
      platform,
      profile.subscription_plan ?? "Starter",
    );
    if (availability !== "available") {
      return NextResponse.json(
        { error: "Verified audience geography is not available on your plan." },
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
