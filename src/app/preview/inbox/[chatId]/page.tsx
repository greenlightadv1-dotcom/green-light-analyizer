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

  return (
    <DealRoomView
      chat={chat}
      chatId={chatId}
      messages={messages}
      currentUserId={mockProfile.id}
      demo
      basePath="/preview"
    />
  );
}
