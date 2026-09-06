import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

export const metadata: Metadata = { title: "Manual analyzer" };

/**
 * Manual Analyzer — §5.1. Structure only.
 *
 * Next pass: a standalone form with `sender_email`, `message_text`,
 * `sponsorship_type` and optional `target_countries`, posting to the SAME
 * Gemini evaluation function the inbound-email webhook uses (§5.4), with the
 * §7.4 payload — including the rule that unverified audience geography can
 * never on its own produce a green rating on a high-value deal.
 */
export default function AnalyzerPage() {
  return (
    <>
      <SectionHeader
        title="Manual analyzer"
        description="Paste an offer you received anywhere and get an instant price recommendation and risk rating. No email connection required."
      />
      <EmptyState
        title="Analyzer form"
        spec="§5.1, §7.4"
        body="Fields: sender email, message text, sponsorship type, and optional target countries. It will call the same evaluation function as the inbound pipeline, so a manual analysis and an auto-analysed email are always priced identically."
      />
    </>
  );
}
