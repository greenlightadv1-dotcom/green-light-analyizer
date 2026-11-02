import type { Metadata } from "next";
import { CollaborationDetailView } from "@/components/collab/CollaborationDetailView";
import { previewBriefs, previewCollaboration, previewDeliverables, previewEvents, previewIds, previewNames } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Collaboration · Preview" };

/** ?side=company shows the company's controls; the default is the creator's. */
export default async function PreviewCollaboration({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const side = (await searchParams).side === "company" ? "company" : "creator";
  return (
    <CollaborationDetailView
      side={side}
      viewerId={side === "company" ? previewIds.company : previewIds.creator}
      collaboration={previewCollaboration}
      deliverables={previewDeliverables}
      events={previewEvents}
      brief={previewBriefs[0]}
      briefTitle={previewBriefs[0].title}
      names={previewNames}
    />
  );
}
