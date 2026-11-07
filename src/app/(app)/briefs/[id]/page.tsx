import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BriefDetailView, type InviteCandidate } from "@/components/collab/BriefDetailView";
import { requireRole } from "@/lib/auth";
import { displayNames, getBrief, listCollaborations, listInvitationsForBrief } from "@/lib/collab/queries";
import { listCreatorDirectory } from "@/lib/deals/directory";
import { companyDetailsComplete } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Brief" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The owning company's view of one brief. A creator can read a published
 * brief under RLS, but this page is management, so anyone but the owner
 * gets a 404. The invite search runs over creator_directory(), which returns
 * no contact or intake columns.
 */
export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("company");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const brief = await getBrief(id);
  if (!brief || brief.company_id !== profile.id) notFound();

  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const [invitations, collaborations] = await Promise.all([listInvitationsForBrief(id), listCollaborations()]);
  const invited = new Set(invitations.map((i) => i.creator_id));

  const candidates: InviteCandidate[] = [];
  if (query && brief.status === "published") {
    const needle = query.toLocaleLowerCase();
    const seen = new Set<string>();
    for (const r of await listCreatorDirectory()) {
      if (seen.has(r.creator_id) || invited.has(r.creator_id)) continue;
      if (!r.full_name?.toLocaleLowerCase().includes(needle)) continue;
      seen.add(r.creator_id);
      candidates.push({ creator_id: r.creator_id, full_name: r.full_name, platforms: [] });
      if (candidates.length >= 10) break;
    }
  }

  const names = await displayNames(invitations.map((i) => i.creator_id));
  const collaborationByInvitation = Object.fromEntries(collaborations.map((c) => [c.invitation_id, c.id]));

  return (
    <BriefDetailView
      brief={brief}
      invitations={invitations}
      names={Object.fromEntries(names)}
      collaborationByInvitation={collaborationByInvitation}
      query={query}
      candidates={candidates}
      detailsComplete={companyDetailsComplete(profile)}
    />
  );
}
