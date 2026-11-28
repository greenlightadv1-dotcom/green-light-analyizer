import { NextResponse } from "next/server";
import { loadApiSession } from "@/lib/api-session";
import { loadNavBadges } from "@/lib/notifications/badges";

/**
 * The signed-in person's nav dots (lib/notifications/badges.ts). Never an
 * error the page has to handle: anyone not signed in, or not yet active, gets
 * no dots. Not cached, since it changes with every new message.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ badges: {} }, { headers: { "cache-control": "no-store" } });
  const badges = await loadNavBadges(session.profile);
  return NextResponse.json({ badges }, { headers: { "cache-control": "no-store" } });
}
