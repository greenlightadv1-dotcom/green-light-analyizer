import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/NotificationsView";
import { previewBriefs, previewNames, previewNotifications } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Notifications · Preview" };

export default function PreviewNotifications() {
  return (
    <NotificationsView
      demo
      notifications={previewNotifications}
      names={previewNames}
      briefTitles={{ [previewBriefs[0].id]: previewBriefs[0].title }}
      muted={["status"]}
    />
  );
}
