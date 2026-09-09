import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealRoomView } from "@/components/views/DealRoomView";
import { mockChats, mockMessages, mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Deal room · Preview" };

export default async function PreviewDealRoom({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const chat = mockChats.find((c) => c.id === chatId);
  if (!chat) notFound();

  // Only the first room has a scripted conversation; the rest render empty,
  // which is itself a state worth seeing.
  const messages = mockMessages.filter((m) => m.chat_id === chatId);

  // A plausible "your history with this domain" for the preview, so the
  // Company & Domain Intelligence panel shows a real-looking state rather
  // than always the empty one — not computed for in-app deals (company_id set).
  const domainHistory =
    !chat.company_id && chat.security_check
      ? {
          domain: chat.security_check.domain,
          isFreeEmail: false,
          dealCount: 1,
          agreedOrPaidCount: chat.deal_status === "agreed" || chat.deal_status === "paid" ? 1 : 0,
          disputedCount: 0,
          lastDealAt: chat.created_at,
        }
      : null;

  return (
    <DealRoomView
      chat={chat}
      chatId={chatId}
      messages={messages}
      currentUserId={mockProfile.id}
      domainHistory={domainHistory}
      demo
      basePath="/preview"
    />
  );
}
