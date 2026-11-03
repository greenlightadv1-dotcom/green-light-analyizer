"use client";

import { useTranslation } from "@/components/LocaleProvider";
import { cadence, topContent } from "@/lib/youtube/content-analytics";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import type { KitVideo } from "@/lib/media-kit/queries";
import type { Platform } from "@/lib/types/database";

/**
 * Top content and posting cadence (0035). YouTube only, from the uploads the
 * YouTube Data API returned on the last sync, with the source and sync time
 * shown. Anything the data cannot support is shown as unavailable, never as
 * zero, and other platforms say why they have no figures.
 */
export function ContentPerformancePanel({ videos, complete, unavailablePlatform }: { videos: KitVideo[]; complete: boolean; unavailablePlatform?: Platform }) {
  const { t, locale } = useTranslation();
  const nf = new Intl.NumberFormat(locale);
  const df = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  if (unavailablePlatform) {
    return (
      <section className="rounded-control border border-line bg-surface-muted p-3 text-xs text-fg-muted">
        <h4 className="mb-1 text-sm font-semibold text-fg">{t("mediaKit.content.title")}</h4>
        {t("mediaKit.content.notForPlatform", { platform: PLATFORM_LABELS[unavailablePlatform] ?? unavailablePlatform })}
      </section>
    );
  }
  if (!videos.length) {
    return (
      <section className="rounded-control border border-line bg-surface-muted p-3 text-xs text-fg-muted">
        <h4 className="mb-1 text-sm font-semibold text-fg">{t("mediaKit.content.title")}</h4>
        {t("mediaKit.content.notSynced")}
      </section>
    );
  }
  const syncedAt = videos.reduce((a, v) => (v.synced_at > a ? v.synced_at : a), videos[0].synced_at);
  const top = topContent(videos, 5);
  const c = cadence(videos, new Date(), complete);
  const unknown = t("mediaKit.content.unknown");
  return (
    <section className="space-y-3 rounded-control border border-line bg-surface-muted p-3" data-content-panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-fg">{t("mediaKit.content.title")}</h4>
        <span className="text-[11px] text-fg-muted">{t("mediaKit.content.source", { n: videos.length, date: df.format(new Date(syncedAt)) })}</span>
      </div>
      <div>
        <h5 className="mb-1 text-xs font-medium text-fg-secondary">{t("mediaKit.content.top")}</h5>
        <ol className="space-y-1 text-xs">
          {top.map((v) => (
            <li key={v.video_id} className="flex flex-wrap justify-between gap-2">
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.video_id)}`} target="_blank" rel="noopener noreferrer" dir="auto" className="min-w-0 truncate text-fg underline-offset-2 hover:underline">{v.title ?? v.video_id}</a>
              <span className="text-fg-muted">
                {t("mediaKit.content.views", { n: nf.format(v.view_count ?? 0) })} · {v.engagement_pct === null ? t("mediaKit.content.engagementHidden") : t("mediaKit.content.engagement", { pct: v.engagement_pct })}
                {v.published_at ? ` · ${df.format(new Date(v.published_at))}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><dt className="text-fg-muted">{t("mediaKit.content.last30")}</dt><dd className="text-fg">{c.last30 ?? unknown}</dd></div>
        <div><dt className="text-fg-muted">{t("mediaKit.content.last90")}</dt><dd className="text-fg">{c.last90 ?? unknown}</dd></div>
        <div><dt className="text-fg-muted">{t("mediaKit.content.gap")}</dt><dd className="text-fg">{c.medianGapDays === null ? unknown : t("mediaKit.content.days", { n: c.medianGapDays })}</dd></div>
        <div><dt className="text-fg-muted">{t("mediaKit.content.consistency")}</dt><dd className="text-fg">{c.consistency ? t(`mediaKit.content.consistencyValue.${c.consistency}`) : unknown}</dd></div>
      </dl>
      <p className="text-[11px] leading-relaxed text-fg-muted">{t("mediaKit.content.note")}</p>
    </section>
  );
}
