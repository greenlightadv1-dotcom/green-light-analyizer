import type { Metadata } from "next";
import { SupportView } from "@/components/views/SupportView";
import { requireCreatorFeatures } from "@/lib/auth";

export const metadata: Metadata = { title: "Support & Help" };

/**
 * Support & Help — creator-side, under the same server-side rule as the Media
 * Kit (lib/access.ts: creators, plus admins). A company is redirected to its
 * dashboard; hiding the nav link is not what keeps it out.
 */
export default async function SupportPage() {
  await requireCreatorFeatures();
  return <SupportView />;
}
