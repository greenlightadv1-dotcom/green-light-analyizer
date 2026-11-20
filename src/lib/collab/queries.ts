import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import type {
  Brief,
  Collaboration,
  CollaborationEvent,
  Deliverable,
  Invitation,
} from "@/lib/types/database";

/**
 * Reads for the collaboration pages. Rows are always read with the caller's
 * own client, so RLS (migration 0026) decides what comes back. The only
 * service-role read is `displayNames`, which returns nothing but the display
 * name of profiles the caller already has a row about (a counterpart on an
 * invitation or collaboration, or a brief's company) — never an email, alias
 * or any other column.
 */

export async function displayNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string"))];
  if (!unique.length) return new Map();
  const { data, error } = await createAdminClient().from("profiles").select("id, full_name").in("id", unique);
  if (error) log.error("collab.names_failed", { error });
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

export async function listOwnBriefs(companyId: string): Promise<Brief[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("briefs")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getBrief(briefId: string): Promise<Brief | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select("*").eq("id", briefId).maybeSingle();
  return data ?? null;
}

/** Published briefs (creators). RLS already limits creators to published ones. */
export async function listPublishedBriefs(): Promise<Brief[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("briefs")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listInvitationsForBrief(briefId: string): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("*")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listCreatorInvitations(creatorId: string): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("*")
    .eq("creator_id", creatorId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

/** Briefs referenced by the caller's invitations or collaborations, readable under RLS. */
export async function briefsByIds(ids: string[]): Promise<Map<string, Brief>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select("*").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((b) => [b.id, b]));
}

/**
 * Brief titles for the caller's own invitations and collaborations. A brief
 * archived after an invitation is no longer readable by the creator under
 * RLS, so its title is fetched here — and only for brief ids that appear on
 * a row the caller can read.
 */
export async function briefTitlesFor(rows: { brief_id: string }[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.brief_id))];
  if (!ids.length) return new Map();
  const { data } = await createAdminClient().from("briefs").select("id, title").in("id", ids);
  return new Map((data ?? []).map((b) => [b.id, b.title]));
}

export async function listCollaborations(): Promise<Collaboration[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collaborations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getCollaboration(collabId: string): Promise<{
  collaboration: Collaboration;
  deliverables: Deliverable[];
  events: CollaborationEvent[];
} | null> {
  // The id is interpolated into a PostgREST or() filter below, so it must be
  // a bare UUID: anything else could add filter terms.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collabId)) return null;
  const supabase = await createClient();
  const { data: collaboration } = await supabase.from("collaborations").select("*").eq("id", collabId).maybeSingle();
  if (!collaboration) return null;
  const [{ data: deliverables }, { data: events }] = await Promise.all([
    supabase.from("deliverables").select("*").eq("collaboration_id", collabId).order("created_at"),
    supabase
      .from("collaboration_events")
      .select("*")
      .or(`collaboration_id.eq.${collabId},invitation_id.eq.${collaboration.invitation_id}`)
      .order("id")
      .limit(500),
  ]);
  return { collaboration, deliverables: deliverables ?? [], events: events ?? [] };
}
