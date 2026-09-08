import type { Metadata } from "next";
import { SettingsView } from "@/components/views/SettingsView";
import { mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Settings · Preview" };

export default function PreviewSettings() {
  return <SettingsView profile={mockProfile} demo />;
}
