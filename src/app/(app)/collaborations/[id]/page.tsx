import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollaborationDetailView } from "@/components/collab/CollaborationDetailView";
import { requireRole } from "@/lib/auth";
import { briefTitlesFor, displayNames, getBrief, getCollaboration } from "@/lib/collab/queries";

export const metadata: Metadata = { title: "Collaboration" };

/**
 * One collaboration. Read under RLS, so a non-party gets a 404; the side
 * comes from the session, never from the URL. Admins see it read-only.
 */
export default async function CollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("creator", "company", "admin");
  const { id } = await params;
  const found = await getCollaboration(id);
  if (!found) notFound();
  const { collaboration: c, deliverables, events } = found;
  const side =
    profile.role === "company" && c.company_id === profile.id ? "company"
    : profile.role === "creator" && c.creator_id === profile.id ? "creator"
    : null;
  if (!side && profile.role !== "admin") notFound();

  const [brief, titles, names] = await Promise.all([
    getBrief(c.brief_id),
    briefTitlesFor([c]),
    displayNames([c.company_id, c.creator_id, c.proposed_by, ...events.map((e) => e.actor_id)]),
  ]);
  return (
    <CollaborationDetailView
      side={side}
      viewerId={profile.id}
      collaboration={c}
      deliverables={deliverables}
      events={events}
      brief={brief}
      briefTitle={titles.get(c.brief_id) ?? ""}
      names={Object.fromEntries(names)}
    />
  );
}
