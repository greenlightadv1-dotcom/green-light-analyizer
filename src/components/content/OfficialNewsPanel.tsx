"use client";

import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";

export type NewsHeadline = { title: string; url: string; published_at: string; source: string };

/**
 * Headlines from allow-listed official feeds that match the creator's
 * categories and games (0037). Each shows its source and publication date;
 * nothing is summarised or generated. Empty when no refresh has run.
 */
export function OfficialNewsPanel({ items }: { items: NewsHeadline[] }) {
  const { t, locale } = useTranslation();
  const df = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <GlassPanel className="mb-4 p-5">
      <h2 className="text-sm font-semibold text-fg">{t("content.news.title")}</h2>
      <p className="mt-1 text-xs text-fg-muted">{t("content.news.intro")}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer" dir="auto" className="text-fg underline-offset-2 hover:underline">{n.title}</a>
              <span className="block text-xs text-fg-muted">{n.source} · {df.format(new Date(n.published_at))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">{t("content.news.empty")}</p>
      )}
    </GlassPanel>
  );
}
