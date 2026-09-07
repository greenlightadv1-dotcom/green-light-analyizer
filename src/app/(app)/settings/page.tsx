import type { Metadata } from "next";
import { SettingsView } from "@/components/views/SettingsView";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await requireProfile();
  return <SettingsView profile={profile} />;
}
