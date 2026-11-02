import type { Metadata } from "next";
import { ShortlistsView } from "@/components/shortlists/ShortlistsView";
import { requireRole } from "@/lib/auth";
import { displayNames } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shortlists" };

/** A company's private shortlists, read under RLS (owner-only). */
export default async function ShortlistsPage() {
  await requireRole("company");
  const supabase = await createClient();
  const { data: lists } = await supabase.from("shortlists").select("id, name").order("name").limit(20);
  const ids = (lists ?? []).map((l) => l.id);
  const { data: entries } = ids.length
    ? await supabase.from("shortlist_entries").select("shortlist_id, creator_id, note, added_at").in("shortlist_id", ids).order("added_at", { ascending: false })
    : { data: [] as { shortlist_id: string; creator_id: string; note: string | null; added_at: string }[] };
  const names = await displayNames((entries ?? []).map((e) => e.creator_id));
  return (
    <ShortlistsView
      lists={(lists ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        entries: (entries ?? [])
          .filter((e) => e.shortlist_id === l.id)
          .map((e) => ({ creator_id: e.creator_id, name: names.get(e.creator_id) ?? "—", note: e.note, added_at: e.added_at })),
      }))}
    />
  );
}
