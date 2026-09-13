import type { Metadata } from "next";
import { DashboardView } from "@/components/views/DashboardView";
import { mockChats, mockKits, mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Dashboard · Preview" };

export default function PreviewDashboard() {
  return (
    <DashboardView profile={mockProfile} chats={mockChats} kits={mockKits} />
  );
}
