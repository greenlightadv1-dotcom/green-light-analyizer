import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

export const metadata: Metadata = { title: "Deal inbox" };

/**
 * Deal Chat Room list. Structure only.
 *
 * Next pass: read `deal_chats` for the signed-in party, show deal_status,
 * ai_evaluation (green | yellow | red), offered_amount and sponsorship_type
 * (§6.2), and subscribe to Supabase Realtime for new rooms created by the
 * inbound email webhook (§5.5).
 */
export default function InboxPage() {
  return (
    <>
      <SectionHeader
        title="Deal inbox"
        description="Every sponsorship offer becomes a chat room here — masked, priced and risk-rated."
      />
      <EmptyState
        title="No deal rooms yet"
        spec="§5, §6.2"
        body="Rooms are created automatically when an offer arrives at your inbound alias, or manually from the analyzer. The list, realtime subscription and status filters are the next build step."
      />
    </>
  );
}
