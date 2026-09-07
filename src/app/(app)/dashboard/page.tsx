import type { Metadata } from "next";
import { DashboardView } from "@/components/views/DashboardView";
import { requireProfile } from "@/lib/auth";
import { listDealChats } from "@/lib/deals/queries";
import { listMediaKits } from "@/lib/media-kit/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  const [chats, kits] = await Promise.all([
    listDealChats(),
    listMediaKits(profile.id),
  ]);

  return <DashboardView profile={profile} chats={chats} kits={kits} />;
}
