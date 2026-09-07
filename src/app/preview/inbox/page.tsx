import type { Metadata } from "next";
import { InboxView } from "@/components/views/InboxView";
import { mockChats } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Deal inbox · Preview" };

export default function PreviewInbox() {
  return <InboxView chats={mockChats} basePath="/preview" />;
}
