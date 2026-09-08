import { NextResponse } from "next/server";
import { isOAuthPlaceholderPlatform } from "@/lib/oauth/platforms";

/**
 * Placeholder OAuth entry point — see src/lib/oauth/platforms.ts.
 *
 * Returns 501 rather than attempting a real redirect: there is no client ID
 * to redirect to yet, and a fake redirect would be untestable and
 * misleading. Once a platform gets a registered app, replace this handler's
 * body with a real redirect to that provider's authorization URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

  if (!isOAuthPlaceholderPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  }

  return NextResponse.json(
    { error: `${platform} is not configured on this environment yet.` },
    { status: 501 },
  );
}
