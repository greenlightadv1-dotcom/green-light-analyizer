import type { Metadata } from "next";
import { MediaKitView } from "@/components/views/MediaKitView";
import { mockKits, mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Media kit · Preview" };

export default function PreviewMediaKit() {
  return (
    <MediaKitView
      kits={mockKits}
      plan={mockProfile.subscription_plan ?? "Starter"}
    />
  );
}
