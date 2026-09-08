import { NextResponse } from "next/server";
import { isOAuthPlaceholderPlatform } from "@/lib/oauth/platforms";

/**
 * Placeholder OAuth callback — see src/lib/oauth/platforms.ts and start/route.ts.
 *
 * Nothing can ever legitimately land here yet, since start/route.ts never
 * redirects anywhere that would call back to this URL. Kept as a real route
 * (rather than only the start endpoint) so the pair is a genuine scaffold to
 * fill in once a platform gets a registered app, not just a dead end.
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
