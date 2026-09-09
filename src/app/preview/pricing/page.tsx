import type { Metadata } from "next";
import { PricingView } from "@/components/views/PricingView";
import { mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Pricing · Preview" };

export default function PreviewPricing() {
  return <PricingView profile={mockProfile} demo />;
}
