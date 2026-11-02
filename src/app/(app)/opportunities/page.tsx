import type { Metadata } from "next";
import { OpportunitiesView } from "@/components/collab/OpportunitiesView";
import { requireRole } from "@/lib/auth";
import { briefTitlesFor, displayNames, listCollaborations, listCreatorInvitations, listPublishedBriefs } from "@/lib/collab/queries";

export const metadata: Metadata = { title: "Opportunities" };

/** Creator: invitations addressed to them, and every published brief. */
export default async function OpportunitiesPage() {
  const profile = await requireRole("creator");
  const [invitations, briefs, collaborations] = await Promise.all([
    listCreatorInvitations(profile.id),
    listPublishedBriefs(),
    listCollaborations(),
  ]);
  const [titles, names] = await Promise.all([
    briefTitlesFor(invitations),
    displayNames([...invitations.map((i) => i.company_id), ...briefs.map((b) => b.company_id)]),
  ]);
  return (
    <OpportunitiesView
      invitations={invitations}
      briefs={briefs}
      briefTitles={Object.fromEntries(titles)}
      names={Object.fromEntries(names)}
      collaborationByInvitation={Object.fromEntries(collaborations.map((c) => [c.invitation_id, c.id]))}
    />
  );
}
