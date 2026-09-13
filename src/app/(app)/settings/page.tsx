import type { Metadata } from "next";
import { SettingsView } from "@/components/views/SettingsView";
import { requireProfile } from "@/lib/auth";
import { listAnalyticsConnections } from "@/lib/media-kit/queries";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await requireProfile();

  // Companies and admins have no media_kits rows, so there is nothing to read
  // and no connections card to fill — skip the query entirely rather than
  // paying for one that can only come back empty.
  const connections =
    profile.role === "creator"
      ? await listAnalyticsConnections(profile.id)
      : undefined;

  return <SettingsView profile={profile} connections={connections} />;
}
