"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { ProvenanceBadge } from "@/components/g/ProvenanceBadge";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import { actionHref } from "@/lib/g/actions";
import type { CreatorAssessment, DealSummary, Finding } from "@/lib/g/assessment";
import type { Brief, ComparisonRow, Recommendation } from "@/lib/g/recommend";
import type { Metric } from "@/lib/g/provenance";
import { gameTitle } from "@/lib/taxonomy";
import type { Platform } from "@/lib/types/database";

const BOX = "rounded-xl border border-fg/10 bg-fg/[0.03] p-3";
const H = "text-[11px] font-semibold tracking-wide text-fg/55 uppercase";

function useFmt() {
  const { locale } = useTranslation();
  return (v: number | string | null) =>
    v === null ? "—" : typeof v === "number" ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v) : v;
}

function FindingList({ title, items }: { title: string; items: Finding[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div>
      <p className={H}>{title}</p>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-fg/75">
        {items.map((f, i) => (
          <li key={`${f.code}-${f.platform ?? ""}-${i}`} className="flex gap-1.5">
            <span aria-hidden className="text-fg/35">•</span>
            <span>
              {f.platform ? <strong className="font-medium">{PLATFORM_LABELS[f.platform as Platform]}: </strong> : null}
              {t(`g.finding.${f.code}`, f.params ?? {})}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricRow({ m }: { m: Metric }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="text-fg/60">{t(`g.metric.${m.key}`)}</span>
      <span className="flex items-center gap-1.5 text-fg">
        {fmt(m.value)}
        <ProvenanceBadge provenance={m.provenance} />
      </span>
    </div>
  );
}

export function AssessmentCard({ a }: { a: CreatorAssessment }) {
  const { t } = useTranslation();
  return (
    <div className={`${BOX} space-y-3`}>
      <p className="text-xs font-semibold text-fg">{t("g.card.assessment")}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-fg/5 p-2">
          <p className="text-fg/50">{t("g.card.profileComplete")}</p>
          <p className="mt-0.5 font-semibold text-fg tabular-nums">
            {a.profile.done}/{a.profile.total}
          </p>
        </div>
        <div className="rounded-lg bg-fg/5 p-2">
          <p className="text-fg/50">{t("g.card.mediaKitComplete")}</p>
          <p className="mt-0.5 font-semibold text-fg tabular-nums">
            {a.mediaKit.done}/{a.mediaKit.total}
          </p>
        </div>
      </div>
      {a.platforms.map((p) => (
        <div key={p.platform} className="rounded-lg border border-fg/8 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg">{PLATFORM_LABELS[p.platform]}</p>
            <span className="text-[10px] text-fg/45">{t(`integrations.${p.integration === "in_development" ? "inDevelopment" : p.integration}`)}</span>
          </div>
          <div className="mt-1">
            {p.metrics.map((m) => (
              <MetricRow key={m.key} m={m} />
            ))}
            <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
              <span className="text-fg/60">{t("g.metric.geography")}</span>
              <span className="flex items-center gap-1.5 text-end text-fg">
                {p.geography.shares.length ? p.geography.shares.slice(0, 3).map((s) => `${s.country} ${s.pct}%`).join(", ") : "—"}
                <ProvenanceBadge provenance={p.geography.provenance} />
              </span>
            </div>
          </div>
        </div>
      ))}
      <FindingList title={t("g.card.strengths")} items={a.strengths} />
      <FindingList title={t("g.card.improve")} items={a.improvements} />
      <FindingList title={t("g.card.missing")} items={a.missing} />
      <p className="text-[10px] leading-relaxed text-fg/40">{t("g.card.thresholdNote")}</p>
    </div>
  );
}

export function DealsCard({ deals }: { deals: { summary?: CreatorAssessment["deals"]; recent: DealSummary[] } }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  return (
    <div className={`${BOX} space-y-2`}>
      <p className="text-xs font-semibold text-fg">{t("g.card.deals")}</p>
      {deals.summary ? (
        <p className="text-xs text-fg/65">{t("g.card.dealsSummary", { total: deals.summary.total, open: deals.summary.open })}</p>
      ) : null}
      {deals.recent.length ? (
        <ul className="space-y-1">
          {deals.recent.map((d) => (
            <li key={d.id}>
              <Link
                href={actionHref({ action: "open_deal", param: d.id })}
                className="flex items-center justify-between gap-2 rounded-lg bg-fg/5 px-2 py-1.5 text-xs text-fg hover:bg-fg/10"
              >
                <span>{t(`badges.status${d.deal_status.charAt(0).toUpperCase()}${d.deal_status.slice(1)}`)}</span>
                <span className="text-fg/55">
                  {d.offered_amount !== null ? `$${fmt(Number(d.offered_amount))}` : "—"}
                  {d.recommended_price_usd !== null ? ` · ${t("g.card.recommended")} $${fmt(Number(d.recommended_price_usd))}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg/50">{t("g.card.noDeals")}</p>
      )}
    </div>
  );
}

export function BriefCard({ brief, missing }: { brief: Brief; missing: string[] }) {
  const { t } = useTranslation();
  const parts = [
    brief.objective,
    brief.categories.map((c) => t(`taxonomy.category.${c}`)).join(", "),
    brief.games.map(gameTitle).join(", "),
    brief.platforms.map((p) => PLATFORM_LABELS[p]).join(", "),
    brief.countries.join(", "),
    brief.maxBudgetUsd !== null ? `≤ $${brief.maxBudgetUsd}` : "",
    brief.timeline,
  ].filter(Boolean);
  return (
    <div className={`${BOX} space-y-1.5`}>
      <p className="text-xs font-semibold text-fg">{t("g.card.brief")}</p>
      <p className="text-xs text-fg/70">{parts.length ? parts.join(" · ") : t("g.card.briefEmpty")}</p>
      {missing.length ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-200">
          {t("g.card.briefMissing")}: {missing.map((m) => t(`g.briefField.${m}`)).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function RecommendationsCard({
  rec,
  onCompare,
}: {
  rec: { directorySize: number; items: Recommendation[] };
  onCompare: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFmt();
  return (
    <div className={`${BOX} space-y-2`}>
      <p className="text-xs font-semibold text-fg">{t("g.card.recommendations")}</p>
      <p className="text-[11px] text-fg/50">{t("g.card.recommendationsBasis", { count: rec.directorySize })}</p>
      {rec.items.length === 0 ? <p className="text-xs text-fg/55">{t("g.card.noRecommendations")}</p> : null}
      {rec.items.map((r) => (
        <div key={r.creator_id} className="rounded-lg border border-fg/8 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fg">{r.full_name}</p>
            <span className="text-[11px] text-fg/55">
              {r.stated ? t("g.card.meets", { met: r.met, stated: r.stated }) : t("g.card.noRequirements")}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {r.requirements.map((q) => (
              <li key={q.requirement} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-fg/65">
                  {q.status === "met" ? "✓" : q.status === "unmet" ? "✗" : "?"} {t(`g.requirement.${q.requirement}`)}
                  {q.detail !== null && q.detail !== undefined && q.detail !== "" ? ` (${q.requirement === "geography" ? `${q.detail}%` : fmt(q.detail as number | string)})` : ""}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-fg/45">{t(`g.status.${q.status}`)}</span>
                  {q.provenance ? <ProvenanceBadge provenance={q.provenance} /> : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Link href={actionHref({ action: "open_creator", param: r.creator_id })} className="text-brand-green underline underline-offset-4">
              {t("g.action.open_creator")}
            </Link>
            <button type="button" onClick={() => onCompare(r.creator_id, r.full_name)} className="text-brand-green underline underline-offset-4">
              {t("discover.addToCompare")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComparisonCard({
  cmp,
}: {
  cmp: { creators: { creator_id: string; full_name: string }[]; rows: ComparisonRow[] };
}) {
  const { t } = useTranslation();
  const fmt = useFmt();
  if (cmp.creators.length < 2) return null;
  return (
    <div className={`${BOX} space-y-2`}>
      <p className="text-xs font-semibold text-fg">{t("g.card.comparison")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-start text-[11px]">
          <thead>
            <tr>
              <th className="py-1 pe-2 text-start font-medium text-fg/50">{t("g.card.criterion")}</th>
              {cmp.creators.map((c) => (
                <th key={c.creator_id} className="py-1 pe-2 text-start font-semibold text-fg">
                  {c.full_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((row) => (
              <tr key={row.criterion} className="border-t border-fg/8 align-top">
                <td className="py-1 pe-2 text-fg/55">{t(`g.metric.${row.criterion}`)}</td>
                {row.values.map((v) => (
                  <td key={v.creator_id} className="py-1 pe-2 text-fg">
                    <span className="block">{fmt(v.value)}</span>
                    <ProvenanceBadge provenance={v.provenance} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-fg/40">{t("g.card.comparisonNote")}</p>
    </div>
  );
}
