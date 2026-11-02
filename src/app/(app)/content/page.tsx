import type { Metadata } from "next";
import { ContentView } from "@/components/content/ContentView";
import { requireRole } from "@/lib/auth";
import { briefTitlesFor } from "@/lib/collab/queries";
import { CONTENT_KINDS, parseMonth } from "@/lib/content/rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Content plan" };

/** A creator's private content plan, read under RLS (owner-only). */
export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("creator");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: items }, { data: collabs }] = await Promise.all([
    supabase.from("content_items").select("*").eq("creator_id", profile.id).order("updated_at", { ascending: false }).limit(500),
    supabase.from("collaborations").select("id, brief_id, status").eq("creator_id", profile.id).in("status", ["negotiating", "active"]).limit(50),
  ]);
  const titles = await briefTitlesFor(collabs ?? []);
  const { year, month } = parseMonth(sp.month, new Date().toISOString().slice(0, 10));
  const kind = typeof sp.kind === "string" && (CONTENT_KINDS as string[]).includes(sp.kind) ? sp.kind : null;
  return (
    <ContentView
      items={items ?? []}
      collaborations={(collabs ?? []).map((c) => ({ id: c.id, title: titles.get(c.brief_id) ?? c.id }))}
      view={sp.view === "calendar" ? "calendar" : "board"}
      kind={kind}
      year={year}
      month={month}
    />
  );
}
