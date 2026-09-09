import type { Metadata } from "next";
import { PricingView } from "@/components/views/PricingView";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const profile = await requireProfile();
  return <PricingView profile={profile} />;
}
