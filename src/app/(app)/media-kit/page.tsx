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
export default async function MediaKitPage() {
  const profile = await requireProfile();
  const kits = await listMediaKits(profile.id);

  return (
    <MediaKitView kits={kits} plan={profile.subscription_plan ?? "Starter"} />
  );
}
