import type { Metadata } from "next";
import { SupportView } from "@/components/views/SupportView";

export const metadata: Metadata = { title: "Support & Help · Preview" };

export default function PreviewSupport() {
  return <SupportView />;
}
