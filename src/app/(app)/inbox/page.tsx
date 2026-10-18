import type { Metadata } from "next";
import { InboxView } from "@/components/views/InboxView";
import { requireProfile } from "@/lib/auth";
import { listDealChats } from "@/lib/deals/queries";
import { listHeldDeliveries } from "@/lib/email/held-queries";

export const metadata: Metadata = { title: "Deal inbox" };

/**
 * RLS decides what comes back, so a creator sees only their own rooms without
 * this page filtering by anything.
 *
 * Held deliveries are the exception, and the reason is worth stating: they are
 * read with the service role (inbound_emails is admin-only under RLS, and
 * should stay that way — see lib/email/held.ts), so RLS is NOT scoping that
 * read. The creator id below is the only thing that does, which is why it is
 * taken from the session and nowhere else. Only creators hold an inbound
 * alias, so only creators get the panel.
 */
export default async function InboxPage() {
  const [profile, chats] = await Promise.all([requireProfile(), listDealChats()]);

  const held =
    profile.role === "creator" ? await listHeldDeliveries(profile.id) : null;

  return <InboxView chats={chats} held={held} />;
}
