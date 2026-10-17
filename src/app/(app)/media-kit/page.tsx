import type { Metadata } from "next";
import { MediaKitView } from "@/components/views/MediaKitView";
import { requireProfile } from "@/lib/auth";
import { listMediaKits } from "@/lib/media-kit/queries";

export const metadata: Metadata = { title: "Media kit" };
/**
 * Server actions run inside this route segment's function, and the ones
 * reachable from this page call the model (src/lib/ai/chat.ts), which budgets
 * up to 50s across its attempts. Without this the segment runs on Vercel's
 * default timeout — well under that — so the platform killed the request
 * before the AI budget was anywhere near spent, and the creator got a dead
 * page rather than the rule-based fallback. 60s is the Hobby ceiling.
 */
export const maxDuration = 60;


/**
 * Media Kit — CLAUDE.md §7.
 *
 * What a creator types lands in declared_top_countries; the verified column is
 * unreachable from the browser's identity by RLS, not by this page choosing
 * not to write it.
 */
export default async function MediaKitPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth_connected?: string; oauth_error?: string }>;
}) {
  const profile = await requireProfile();
  const kits = await listMediaKits(profile.id);
  const { oauth_connected, oauth_error } = await searchParams;

  return (
    <MediaKitView
      profile={profile}
      kits={kits}
      plan={profile.subscription_plan ?? "Starter"}
      oauthConnected={oauth_connected ?? null}
      oauthError={oauth_error ?? null}
    />
  );
}
