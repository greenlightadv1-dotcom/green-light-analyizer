import type { Metadata } from "next";
import { AnalyzerView } from "@/components/views/AnalyzerView";
import { mockKits } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Manual analyzer · Preview" };

export default function PreviewAnalyzer() {
  // The Twitch kit: self-reported geography, which is what makes the §7.4 cap
  // visible on the canned result.
  const kit = mockKits[1];
  return <AnalyzerView kit={kit} demo />;
}
