import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaxonomy } from "@/lib/taxonomy-server";
import { TERM_KINDS, termsOf } from "@/lib/taxonomy";
import { TermForm } from "./TermForm";

export const metadata: Metadata = { title: "Taxonomy" };
export const dynamic = "force-dynamic";

/**
 * Admin-only management of the taxonomy (0033): categories, genres, games,
 * sports, formats, interests, specializations and campaign categories.
 * Ids never change; a term in use is deactivated, never deleted.
 */
export default async function AdminTaxonomyPage() {
  await requireRole("admin");
  const snap = await getTaxonomy();
  const service = createAdminClient();
  const usage = new Map<string, number>();
  if (snap.source === "database") {
    await Promise.all(
      snap.terms.map(async (t) => {
        const { data } = await service.rpc("taxonomy_usage", { p_id: t.id });
        usage.set(t.id, typeof data === "number" ? data : 0);
      }),
    );
  }
  const parents = termsOf(snap, ["category", "genre"], { activeOnly: false });
  return (
    <>
      <SectionHeader title="Taxonomy" description="The categories, genres, games, sports, formats, interests, specializations and campaign categories creators and companies pick from. Labels are shown in English and Arabic; other languages fall back to English for terms added here." />
      {snap.source === "seed" ? (
        <GlassPanel className="mb-4 p-5 text-sm text-fg-muted">The taxonomy table is not on this database yet, so the built-in list is in use and cannot be edited. Ask the developer to apply the latest database update.</GlassPanel>
      ) : (
        <GlassPanel className="mb-4 space-y-3 p-5">
          <h2 className="text-sm font-semibold text-fg">Add a term</h2>
          <TermForm term={null} parents={parents} />
        </GlassPanel>
      )}
      <div className="space-y-4">
        {TERM_KINDS.map((kind) => {
          const terms = termsOf(snap, kind, { activeOnly: false });
          return (
            <GlassPanel key={kind} className="overflow-hidden">
              <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{kind.replace(/_/g, " ")} ({terms.length})</h2>
              {terms.length ? (
                <ul className="divide-y divide-line">
                  {terms.map((t) => (
                    <li key={t.id} className="px-5 py-3">
                      <details>
                        <summary className="cursor-pointer text-sm text-fg">
                          <span className={t.active ? "" : "line-through opacity-60"}>{t.label_en}</span>
                          <span className="text-fg-muted" dir="rtl"> · {t.label_ar}</span>
                          <span className="text-xs text-fg-muted" dir="ltr"> · {t.id}{t.parent_id ? ` ← ${t.parent_id}` : ""}{t.active ? "" : " · inactive"}</span>
                        </summary>
                        {snap.source === "database" ? <div className="mt-3"><TermForm term={t} parents={parents} usage={usage.get(t.id) ?? 0} /></div> : null}
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-fg-muted">None yet.</p>
              )}
            </GlassPanel>
          );
        })}
      </div>
    </>
  );
}
