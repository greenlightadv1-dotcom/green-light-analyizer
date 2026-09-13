import type { Metadata } from "next";
import { MediaKitView } from "@/components/views/MediaKitView";
import { requireProfile } from "@/lib/auth";
import { listMediaKits } from "@/lib/media-kit/queries";

export const metadata: Metadata = { title: "Media kit" };

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
      oauthConfigured={{
        youtube: Boolean(
          process.env.GOOGLE_OAUTH_CLIENT_ID &&
            process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
            process.env.NEXT_PUBLIC_APP_URL,
        ),
        instagram: Boolean(
          process.env.META_APP_ID &&
            process.env.META_APP_SECRET &&
            process.env.NEXT_PUBLIC_APP_URL,
        ),
      }}
    />
  );
}
