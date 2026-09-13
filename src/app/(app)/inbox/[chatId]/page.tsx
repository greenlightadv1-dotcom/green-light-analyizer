import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealRoomView } from "@/components/views/DealRoomView";
import { requireProfile } from "@/lib/auth";
import { getOwnHistoryWithDomain } from "@/lib/deals/company-intelligence";
import { getDealChat, listMessages } from "@/lib/deals/queries";

export const metadata: Metadata = { title: "Deal room" };

/**
 * Deal Chat Room — CLAUDE.md §6.
 *
 * Messages arrive here already masked: the server strips contact details
 * before the row is written (see actions.ts), so nothing rendered on this page
 * can contain a phone number or an external handle even if a sender tried.
 */
export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;

  const [profile, chat] = await Promise.all([
    requireProfile(),
    getDealChat(chatId),
  ]);

  // Null means either "no such room" or "not yours" — RLS does not distinguish,
  // and neither should the response.
  if (!chat) notFound();

  // Company & Domain Intelligence (§3): only meaningful for an external
  // sender — an in-app deal's company_id is already a real platform account.
  const [messages, domainHistory] = await Promise.all([
    listMessages(chatId),
    chat.company_id ? Promise.resolve(null) : getOwnHistoryWithDomain(chat.sender_email, chatId),
  ]);

  return (
    <DealRoomView
      chat={chat}
      chatId={chatId}
      messages={messages}
      currentUserId={profile.id}
      domainHistory={domainHistory}
    />
  );
}
