import type { Metadata } from "next";
import { CollaborationsView } from "@/components/collab/CollaborationsView";
import { previewBriefs, previewCollaboration, previewNames } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Collaborations · Preview" };

export default function PreviewCollaborations() {
  return (
    <CollaborationsView
      role="creator"
      collaborations={[previewCollaboration]}
      names={previewNames}
      briefTitles={{ [previewBriefs[0].id]: previewBriefs[0].title }}
    />
  );
}
