import type { Metadata } from "next";
import { AdminDashboardView } from "@/components/views/AdminDashboardView";
import { CompanyDashboardView } from "@/components/views/CompanyDashboardView";
import { DashboardView } from "@/components/views/DashboardView";
import { requireProfile } from "@/lib/auth";
import { listDealChats } from "@/lib/deals/queries";
import { listMediaKits } from "@/lib/media-kit/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  // A company has no inbound alias and no media kit of its own (§3) — the
  // creator dashboard's cards would either be empty or nonsensical for one,
  // so it gets its own view rather than a version of this one with things
  // hidden.
  if (profile.role === "company") {
    const chats = await listDealChats();
    return <CompanyDashboardView profile={profile} chats={chats} />;
  }

  // An admin has no alias, media kit or deals of their own: the admin home
  // links to the pages where admin work happens instead.
  if (profile.role === "admin") return <AdminDashboardView />;

  const [chats, kits] = await Promise.all([
    listDealChats(),
    listMediaKits(profile.id),
  ]);

  return <DashboardView profile={profile} chats={chats} kits={kits} />;
}
