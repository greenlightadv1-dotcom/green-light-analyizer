import type { Metadata } from "next";
import { OpportunitiesView } from "@/components/collab/OpportunitiesView";
import { previewBriefs, previewCollaboration, previewCreatorInvitations, previewNames } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Opportunities · Preview" };

export default function PreviewOpportunities() {
  return (
    <OpportunitiesView
      invitations={previewCreatorInvitations}
      briefs={[previewBriefs[0]]}
      briefTitles={{ [previewBriefs[0].id]: previewBriefs[0].title }}
      names={previewNames}
      collaborationByInvitation={{ [previewCollaboration.invitation_id]: previewCollaboration.id }}
    />
  );
}
