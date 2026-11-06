import type { Metadata } from "next";
import { BriefDetailView } from "@/components/collab/BriefDetailView";
import { previewBriefs, previewCollaboration, previewIds, previewInvitations, previewNames } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Brief · Preview" };

export default function PreviewBrief() {
  return (
    <BriefDetailView
      brief={previewBriefs[0]}
      invitations={previewInvitations}
      names={previewNames}
      collaborationByInvitation={{ [previewCollaboration.invitation_id]: previewCollaboration.id }}
      query="omar"
      candidates={[{ creator_id: previewIds.creator.replace("a1", "a3"), full_name: "Omar Gaming (demo)", platforms: [] }]}
      detailsComplete
    />
  );
}
