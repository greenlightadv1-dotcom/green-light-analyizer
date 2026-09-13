import type { Metadata } from "next";
import { InboxView } from "@/components/views/InboxView";
import { listDealChats } from "@/lib/deals/queries";

export const metadata: Metadata = { title: "Deal inbox" };

/**
 * RLS decides what comes back, so a creator sees only their own rooms without
 * this page filtering by anything.
 */
export default async function InboxPage() {
  const chats = await listDealChats();
  return <InboxView chats={chats} />;
}
