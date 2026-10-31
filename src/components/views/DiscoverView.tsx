"use client";

import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CountryShareList } from "@/components/media-kit/CountryShareList";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ProvenanceBadge } from "@/components/g/ProvenanceBadge";
import { emitG } from "@/components/g/events";
import { useTranslation } from "@/components/LocaleProvider";
import { OfferPanel } from "@/app/(app)/discover/OfferPanel";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import { DISCOVERY_SORTS, type DiscoveryQuery } from "@/lib/discovery";
import { CONTENT_CATEGORIES, GAME_IDS, gameTitle, knownCategories, knownGames } from "@/lib/taxonomy";
import type { CountryShare, CreatorDirectoryEntry, Platform } from "@/lib/types/database";

const INPUT =
  "h-10 w-full rounded-lg border border-fg/10 bg-fg/5 px-3 text-sm text-fg placeholder:text-fg/35 focus:border-brand-green/50 focus:outline-none";

function compact(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export type DiscoverEntry = CreatorDirectoryEntry & { freshVerified: boolean };

/**
 * Company-facing Creator Discovery (feature 8). The server filtered, sorted
 * and paginated the authorized creator_directory() rows; this renders one
 * page. Every figure carries its provenance: reach, engagement and rates are
 * what the creator disclosed; geography is "verified" only when it came from
 * a connected analytics account within the last 30 days.
 */
export function DiscoverView({
  items,
  total,
  page,
  pages,
  query,
  selected,
  directoryEmpty,
}: {
  items: DiscoverEntry[];
  total: number;
  page: number;
  pages: number;
  query: DiscoveryQuery;
  selected: DiscoverEntry | null;
  directoryEmpty: boolean;
}) {
  const { t, locale } = useTranslation();

  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (query.q) sp.set("q", query.q);
    if (query.category) sp.set("category", query.category);
    if (query.game) sp.set("game", query.game);
    if (query.platform) sp.set("platform", query.platform);
    if (query.country) sp.set("country", query.country);
    if (query.minViews !== null) sp.set("minViews", String(query.minViews));
    if (query.verifiedOnly) sp.set("verified", "1");
    if (query.sort !== "reach") sp.set("sort", query.sort);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/discover?${s}` : "/discover";
  };

  const card = (c: DiscoverEntry, highlight = false) => {
    const cats = knownCategories(c.creator_categories ?? (c.content_category ? [c.content_category] : []));
    const games = knownGames(c.creator_games);
    return (
      <GlassPanel
        key={`${highlight ? "sel-" : ""}${c.creator_id}`}
        className={`p-5 ${highlight ? "border-brand-green/40 ring-1 ring-brand-green/25" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {c.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fg/8 text-sm font-semibold text-fg/60">
                {c.full_name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold break-words text-fg">{c.full_name}</p>
              <p className="mt-0.5 text-xs text-fg/45">
                {c.platforms?.length
                  ? c.platforms.map((p) => PLATFORM_LABELS[p as Platform] ?? p).join(", ")
                  : t("discover.noPlatforms")}
                {c.content_language ? ` · ${c.content_language}` : ""}
              </p>
              {cats.length || games.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cats.map((k) => (
                    <span key={k} className="rounded-full bg-fg/6 px-2 py-0.5 text-[11px] text-fg/65">
                      {t(`taxonomy.category.${k}`)}
                    </span>
                  ))}
                  {games.map((g) => (
                    <span key={g} className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[11px] text-brand-green">
                      {gameTitle(g)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <OfferPanel creatorId={c.creator_id} creatorName={c.full_name} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-fg/8 pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-fg/45">{t("g.metric.avg_views")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-fg">
              {c.avg_views !== null ? compact(c.avg_views, locale) : "—"}
              <ProvenanceBadge provenance={c.avg_views !== null ? "self_reported" : "missing"} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-fg/45">{t("g.metric.engagement_rate")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-fg">
              {c.engagement_rate !== null ? `${Number(c.engagement_rate)}%` : "—"}
              <ProvenanceBadge provenance={c.engagement_rate !== null ? "self_reported" : "missing"} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-fg/45">{t("g.metric.base_rate_usd")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-fg">
              {c.base_rate_usd !== null && c.base_rate_usd !== undefined ? `$${Number(c.base_rate_usd)}` : "—"}
              <ProvenanceBadge provenance={c.base_rate_usd !== null && c.base_rate_usd !== undefined ? "self_reported" : "missing"} />
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-fg/8 pt-4">
          <CountryShareList
            shares={(c.freshVerified ? c.verified_top_countries : c.declared_top_countries) as CountryShare[] | null}
            verified={c.freshVerified}
            emptyHint={t("discover.noGeography")}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {c.shareable_slug ? (
            <Link href={`/p/${c.shareable_slug}`} className="text-brand-green underline underline-offset-4" target="_blank">
              {t("discover.viewProfile")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => emitG({ type: "compare", creatorId: c.creator_id, name: c.full_name })}
            className="text-brand-green underline underline-offset-4"
          >
            {t("discover.addToCompare")}
          </button>
          <button
            type="button"
            onClick={() => emitG({ type: "ask", text: t("discover.askGAbout", { name: c.full_name }) })}
            className="text-fg/55 underline underline-offset-4 hover:text-fg"
          >
            {t("discover.askG")}
          </button>
        </div>
      </GlassPanel>
    );
  };

  return (
    <>
      <SectionHeader title={t("discover.title")} description={t("discover.description")} />

      <GlassPanel as="section" className="mb-4 p-4 sm:p-5">
        <form method="get" action="/discover" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-fg/55 lg:col-span-2">
            <span>{t("discover.search")}</span>
            <input name="q" defaultValue={query.q} className={INPUT} placeholder={t("discover.searchPlaceholder")} />
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.category")}</span>
            <select name="category" defaultValue={query.category ?? ""} className={INPUT}>
              <option value="">{t("discover.any")}</option>
              {CONTENT_CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {t(`taxonomy.category.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.game")}</span>
            <select name="game" defaultValue={query.game ?? ""} className={INPUT}>
              <option value="">{t("discover.any")}</option>
              {GAME_IDS.map((g) => (
                <option key={g} value={g}>
                  {gameTitle(g)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.platform")}</span>
            <select name="platform" defaultValue={query.platform ?? ""} className={INPUT}>
              <option value="">{t("discover.any")}</option>
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.country")}</span>
            <input
              name="country"
              defaultValue={query.country ?? ""}
              maxLength={2}
              placeholder="EG"
              className={`${INPUT} uppercase`}
              dir="ltr"
            />
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.minViews")}</span>
            <input name="minViews" type="number" min={0} defaultValue={query.minViews ?? ""} className={INPUT} dir="ltr" />
          </label>
          <label className="space-y-1 text-xs text-fg/55">
            <span>{t("discover.sort")}</span>
            <select name="sort" defaultValue={query.sort} className={INPUT}>
              {DISCOVERY_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`discover.sortBy.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-fg/65 sm:col-span-2 lg:col-span-2">
            <input type="checkbox" name="verified" value="1" defaultChecked={query.verifiedOnly} className="h-4 w-4 accent-brand-green" />
            {t("discover.verifiedOnly")}
          </label>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-2 lg:justify-end">
            <Link href="/discover" className="text-xs text-fg/50 underline underline-offset-4 hover:text-fg">
              {t("discover.reset")}
            </Link>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-xl bg-brand-green px-5 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              {t("discover.apply")}
            </button>
          </div>
        </form>
        <p className="mt-3 text-[11px] leading-relaxed text-fg/40">{t(`discover.sortExplain.${query.sort}`)}</p>
      </GlassPanel>

      {selected ? <div className="mb-4">{card(selected, true)}</div> : null}

      {directoryEmpty ? (
        <EmptyState title={t("discover.emptyTitle")} body={t("discover.emptyBody")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("discover.noMatchTitle")} body={t("discover.noMatchBody")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-fg/45" aria-live="polite">
            {t("discover.resultCount", { count: total })}
          </p>
          <div className="space-y-3">{items.map((c) => card(c))}</div>
          {pages > 1 ? (
            <nav className="mt-5 flex items-center justify-between text-sm" aria-label={t("discover.pagination")}>
              {page > 1 ? (
                <Link href={href(page - 1)} className="text-brand-green underline underline-offset-4">
                  {t("discover.previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-fg/45">{t("discover.pageOf", { page, pages })}</span>
              {page < pages ? (
                <Link href={href(page + 1)} className="text-brand-green underline underline-offset-4">
                  {t("discover.next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
