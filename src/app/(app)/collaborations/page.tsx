import type { Metadata } from "next";
import { CollaborationsView } from "@/components/collab/CollaborationsView";
import { requireRole } from "@/lib/auth";
import { briefTitlesFor, displayNames, listCollaborations } from "@/lib/collab/queries";

export const metadata: Metadata = { title: "Collaborations" };

/** Parties see their own collaborations; admins see all of them, read-only (RLS). */
export default async function CollaborationsPage() {
  const profile = await requireRole("creator", "company", "admin");
  const collaborations = await listCollaborations();
  const [titles, names] = await Promise.all([
    briefTitlesFor(collaborations),
    displayNames(collaborations.flatMap((c) => [c.company_id, c.creator_id])),
  ]);
  return (
    <CollaborationsView
      role={profile.role}
      collaborations={collaborations}
      names={Object.fromEntries(names)}
      briefTitles={Object.fromEntries(titles)}
    />
  );
}
