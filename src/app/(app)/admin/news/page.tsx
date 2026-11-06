import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEWS_SOURCES, newsEnabled } from "@/lib/news/sources";
import { utcStamp } from "@/lib/ui/format";
import { refreshNewsNow } from "./actions";

export const metadata: Metadata = { title: "Official news" };
export const dynamic = "force-dynamic";

/** Admin-only: the allow-listed official sources, what is stored, and a manual refresh. */
export default async function AdminNewsPage() {
  await requireRole("admin");
  const { data: items, error } = await createAdminClient().from("news_items").select("source_id, title, url, published_at, retrieved_at").order("published_at", { ascending: false }).limit(60);
  return (
    <>
      <SectionHeader
        title="Official news"
        description="Headlines from official, free feeds only (YouTube Official Blog RSS; Valve's Steam news API, developer announcements only). Headline, link and dates are stored, never article text. Nothing runs on a schedule until NEWS_MONITORING_ENABLED=1 and CRON_SECRET are set and the cron is scheduled; no one is notified."
      />
      <GlassPanel className="mb-4 space-y-3 p-5 text-sm">
        <p className="text-fg">Scheduled monitoring: <strong>{newsEnabled() ? "enabled by configuration (still needs a schedule)" : "off"}</strong></p>
        <ul className="list-disc ps-5 text-xs text-fg-secondary">{NEWS_SOURCES.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
        {error ? <p className="text-xs text-fg-muted">The news table is not on this database yet. Ask the developer to apply the latest database update.</p> : (
          <ConfirmActionForm action={refreshNewsNow} hidden={{}} trigger={{ labelKey: "adminNews.refresh" }} triggerClassName="h-9 rounded-chip bg-brand-green px-3 text-xs font-semibold text-ink" titleKey="adminNews.refreshTitle" bodyKey="adminNews.refreshBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" />
        )}
      </GlassPanel>
      <GlassPanel className="overflow-hidden">
        <ul className="divide-y divide-line text-sm">
          {(items ?? []).map((i) => (
            <li key={`${i.source_id}-${i.url}`} className="px-5 py-2">
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-fg underline-offset-2 hover:underline" dir="auto">{i.title}</a>
              <span className="block text-xs text-fg-muted">{NEWS_SOURCES.find((s) => s.id === i.source_id)?.name ?? i.source_id} · published {utcStamp(i.published_at)} · retrieved {utcStamp(i.retrieved_at)}</span>
            </li>
          ))}
          {!items?.length ? <li className="px-5 py-4 text-fg-muted">No headlines stored yet.</li> : null}
        </ul>
      </GlassPanel>
    </>
  );
}
