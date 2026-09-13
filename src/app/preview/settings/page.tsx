import type { Metadata } from "next";
import { SettingsView } from "@/components/views/SettingsView";
import { mockKits, mockProfile } from "@/lib/preview/mock";
import { isRealOAuthPlatform } from "@/lib/oauth/platforms";
import type { OAuthPlatform } from "@/lib/types/database";

export const metadata: Metadata = { title: "Settings · Preview" };

// Derived from the same fixture the Media Kit preview uses, so the two pages
// cannot disagree about which platforms this mock creator has connected.
const connections: Partial<Record<OAuthPlatform, boolean>> = Object.fromEntries(
  mockKits
    .filter((kit) => isRealOAuthPlatform(kit.platform))
    .map((kit) => [kit.platform, kit.analytics_oauth_connected === true]),
);

export default function PreviewSettings() {
  return <SettingsView profile={mockProfile} connections={connections} demo />;
}
