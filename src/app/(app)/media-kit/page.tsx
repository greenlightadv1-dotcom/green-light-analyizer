import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

export const metadata: Metadata = { title: "Media kit" };

/**
 * Platform connections and audience data — §7. Structure only.
 *
 * Next pass, per the verification matrix in §7.3:
 *   - YouTube / Instagram: optional OAuth connect -> verified_top_countries,
 *     rendered with a "verified" badge, gated to paid tiers.
 *   - Twitch / Kick / TikTok: declared_top_countries only, and the UI must
 *     always show a visible "self-reported" tag next to it.
 *   - Disconnecting must immediately set audience_verified = false and clear
 *     verified_top_countries (§12).
 */
export default function MediaKitPage() {
  return (
    <>
      <SectionHeader
        title="Media kit"
        description="Stats shown to companies come from platform APIs, never from screenshots. Anything self-reported is labelled as such."
      />
      <EmptyState
        title="Platform connections"
        spec="§7.1–§7.3"
        body="Per-platform cards for YouTube, Twitch, Kick and Instagram: reach, engagement rate, content category and language, plus declared vs. verified audience geography. Verified geo requires the opt-in Analytics OAuth flows and is Pro/Elite only."
      />
    </>
  );
}
