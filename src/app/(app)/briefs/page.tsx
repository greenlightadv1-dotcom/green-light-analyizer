import type { Metadata } from "next";
import { BriefsView } from "@/components/collab/BriefsView";
import { requireRole } from "@/lib/auth";
import { listOwnBriefs } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Briefs" };

/** A company's own campaign briefs. Company-only; rows are read under RLS. */
export default async function BriefsPage() {
  const profile = await requireRole("company");
  const briefs = await listOwnBriefs(profile.id);
  const supabase = await createClient();
  const { data: invitations } = briefs.length
    ? await supabase.from("invitations").select("brief_id").eq("company_id", profile.id)
    : { data: [] as { brief_id: string }[] };
  const count = new Map<string, number>();
  for (const i of invitations ?? []) count.set(i.brief_id, (count.get(i.brief_id) ?? 0) + 1);
  return (
    <BriefsView
      newHref="/briefs/new"
      briefs={briefs.map((b) => ({
        id: b.id, title: b.title, status: b.status, budget_min_usd: b.budget_min_usd, budget_max_usd: b.budget_max_usd,
        due_date: b.due_date, updated_at: b.updated_at, invitations: count.get(b.id) ?? 0,
      }))}
    />
  );
}
