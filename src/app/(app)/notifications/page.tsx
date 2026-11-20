import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/NotificationsView";
import { requireRole } from "@/lib/auth";
import { briefTitlesFor, displayNames } from "@/lib/collab/queries";
import { listNotifications, mutedCategories } from "@/lib/notifications/queries";

export const metadata: Metadata = { title: "Notifications" };

/** Creators and companies: their own notifications (RLS) and preferences. */
export default async function NotificationsPage() {
  const profile = await requireRole("creator", "company");
  const [notifications, muted] = await Promise.all([listNotifications(), mutedCategories(profile.id)]);
  const [names, titles] = await Promise.all([
    displayNames(notifications.map((n) => n.actor_id)),
    briefTitlesFor(notifications.filter((n): n is typeof n & { brief_id: string } => !!n.brief_id)),
  ]);
  return (
    <NotificationsView
      notifications={notifications}
      names={Object.fromEntries(names)}
      briefTitles={Object.fromEntries(titles)}
      muted={muted}
    />
  );
}
