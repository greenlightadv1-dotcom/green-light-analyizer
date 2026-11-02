"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { deleteContentItem, saveContentItem } from "@/app/(app)/content/actions";
import { BOARD_STATUSES, CONTENT_KINDS, CONTENT_LIMITS, CONTENT_STATUSES, monthGrid, monthKey, shiftMonth } from "@/lib/content/rules";
import { PORTFOLIO_PLATFORMS } from "@/lib/portfolio/rules";
import { day, PLATFORM_LABEL } from "@/lib/collab/display";
import type { ActionResult } from "@/lib/ui/action-result";
import type { ContentItem } from "@/lib/types/database";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Labelled, SELECT_CLASS, TextArea, TextInput } from "@/components/collab/ui";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const opt = "bg-slate-900 text-white";

function ItemForm({ item, collaborations, demo, defaultDate }: { item: ContentItem | null; collaborations: { id: string; title: string }[]; demo: boolean; defaultDate?: string }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveContentItem, null);
  const p = item?.id ?? "new";
  return (
    <form action={action} className="space-y-3">
      {item ? <input type="hidden" name="item_id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled id={`c-kind-${p}`} labelKey="content.fieldKind">
          <select id={`c-kind-${p}`} name="kind" className={SELECT_CLASS} defaultValue={item?.kind ?? "idea"}>
            {CONTENT_KINDS.map((k) => <option key={k} value={k} className={opt}>{t(`content.kind.${k}`)}</option>)}
          </select>
        </Labelled>
        <Labelled id={`c-status-${p}`} labelKey="content.fieldStatus">
          <select id={`c-status-${p}`} name="status" className={SELECT_CLASS} defaultValue={item?.status ?? "idea"}>
            {CONTENT_STATUSES.map((s) => <option key={s} value={s} className={opt}>{t(`content.status.${s}`)}</option>)}
          </select>
        </Labelled>
        <TextInput id={`c-date-${p}`} name="planned_for" type="date" labelKey="content.fieldDate" defaultValue={item?.planned_for ?? defaultDate ?? ""} />
      </div>
      <TextInput id={`c-title-${p}`} name="title" labelKey="content.fieldTitle" required maxLength={CONTENT_LIMITS.title[1]} defaultValue={item?.title ?? ""} />
      <TextArea id={`c-body-${p}`} name="body" labelKey="content.fieldBody" maxLength={CONTENT_LIMITS.body} rows={6} defaultValue={item?.body ?? ""} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled id={`c-platform-${p}`} labelKey="content.fieldPlatform">
          <select id={`c-platform-${p}`} name="platform" className={SELECT_CLASS} defaultValue={item?.platform ?? ""}>
            <option value="" className={opt}>{t("content.platformNone")}</option>
            {PORTFOLIO_PLATFORMS.map((x) => <option key={x} value={x} className={opt}>{x === "other" ? t("portfolio.platformOther") : PLATFORM_LABEL[x]}</option>)}
          </select>
        </Labelled>
        <TextInput id={`c-tags-${p}`} name="tags" labelKey="content.fieldTags" hintKey="content.tagsHint" defaultValue={item?.tags.join(", ") ?? ""} />
        <Labelled id={`c-collab-${p}`} labelKey="content.fieldCollab">
          <select id={`c-collab-${p}`} name="collaboration_id" className={SELECT_CLASS} defaultValue={item?.collaboration_id ?? ""}>
            <option value="" className={opt}>{t("content.collabNone")}</option>
            {collaborations.map((c) => <option key={c.id} value={c.id} className={opt}>{c.title}</option>)}
          </select>
        </Labelled>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || demo} className={BTN_PRIMARY}>{pending ? t("content.saving") : t("content.save")}</button>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
            {state.ok ? t("content.saved") : t(state.errorKey)}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function ItemCard({ item, collaborations, demo }: { item: ContentItem; collaborations: { id: string; title: string }[]; demo: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 rounded-control border border-line bg-surface-muted p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone="info" dot={false}>{t(`content.kind.${item.kind}`)}</StatusBadge>
        {item.planned_for ? <span className="text-xs text-fg-muted">{day(item.planned_for)}</span> : null}
      </div>
      <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{item.title}</p>
      {item.body ? <p dir="auto" className="line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere] text-xs text-fg-secondary">{item.body}</p> : null}
      {item.tags.length ? <p dir="auto" className="text-xs text-fg-muted">{item.tags.map((x) => `#${x}`).join(" ")}</p> : null}
      <details>
        <summary className="cursor-pointer text-xs text-fg-muted">{t("content.edit")}</summary>
        <div className="mt-3 space-y-3">
          <ItemForm item={item} collaborations={collaborations} demo={demo} />
          <ConfirmActionForm
            action={deleteContentItem}
            hidden={{ item_id: item.id }}
            trigger={{ labelKey: "content.delete" }}
            triggerClassName={BTN_DANGER}
            titleKey="content.deleteTitle"
            bodyKey="content.deleteBody"
            confirmKey="content.deleteConfirm"
            tone="danger"
            className="flex flex-wrap items-center gap-2"
          />
        </div>
      </details>
    </div>
  );
}

/** A creator's private content plan: a status board and a month calendar. */
export function ContentView({
  items,
  collaborations,
  view,
  kind,
  year,
  month,
  basePath = "",
  demo = false,
}: {
  items: ContentItem[];
  collaborations: { id: string; title: string }[];
  view: "board" | "calendar";
  kind: string | null;
  year: number;
  month: number;
  basePath?: string;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const href = (q: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { view, kind, month: monthKey(year, month), ...q };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `${basePath}/content?${p.toString()}`;
  };
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const byDay = new Map<string, ContentItem[]>();
  for (const i of shown) if (i.planned_for) byDay.set(i.planned_for, [...(byDay.get(i.planned_for) ?? []), i]);
  const archived = shown.filter((i) => i.status === "archived");
  const tab = (active: boolean) => `${active ? "bg-brand-green text-ink" : "text-fg-muted hover:text-fg"} rounded-chip px-3 py-1.5 text-sm font-medium focus-visible:focus-ring`;

  return (
    <>
      <SectionHeader title={t("content.title")} description={t("content.description")} />
      <p className="-mt-3 mb-4 text-xs text-fg-muted">{t("content.privateNote")}</p>

      <GlassPanel className="mb-4 p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-fg">{t("content.new")}</summary>
          <div className="mt-4"><ItemForm item={null} collaborations={collaborations} demo={demo} /></div>
        </details>
      </GlassPanel>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("content.title")} className="flex gap-1 rounded-control border border-line bg-surface-muted p-1">
          <Link href={href({ view: "board" })} aria-current={view === "board" ? "page" : undefined} className={tab(view === "board")}>{t("content.board")}</Link>
          <Link href={href({ view: "calendar" })} aria-current={view === "calendar" ? "page" : undefined} className={tab(view === "calendar")}>{t("content.calendar")}</Link>
        </nav>
        <div className="flex flex-wrap gap-1">
          <Link href={href({ kind: null })} className={tab(!kind)}>{t("content.all")}</Link>
          {CONTENT_KINDS.map((k) => (
            <Link key={k} href={href({ kind: k })} className={tab(kind === k)}>{t(`content.kind.${k}`)}</Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t("content.empty")} body={t("content.emptyBody")} />
      ) : view === "board" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {BOARD_STATUSES.map((s) => {
              const col = shown.filter((i) => i.status === s);
              return (
                <section key={s} aria-labelledby={`col-${s}`} className="space-y-2">
                  <h2 id={`col-${s}`} className="text-xs font-semibold tracking-wide text-fg-secondary uppercase">
                    {t(`content.status.${s}`)} <span className="text-fg-muted">({col.length})</span>
                  </h2>
                  {col.map((i) => <ItemCard key={i.id} item={i} collaborations={collaborations} demo={demo} />)}
                </section>
              );
            })}
          </div>
          {archived.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-fg-muted">{t("content.archived", { count: archived.length })}</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {archived.map((i) => <ItemCard key={i.id} item={i} collaborations={collaborations} demo={demo} />)}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <GlassPanel className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={href({ month: monthKey(prev.year, prev.month) })} className={`${BTN_GHOST} h-8`} aria-label={t("content.prevMonth")}>‹</Link>
            <h2 className="text-sm font-semibold text-fg" dir="ltr">{monthKey(year, month)}</h2>
            <Link href={href({ month: monthKey(next.year, next.month) })} className={`${BTN_GHOST} h-8`} aria-label={t("content.nextMonth")}>›</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
              <thead>
                <tr>{WEEKDAYS.map((d) => <th key={d} scope="col" className="pb-2 font-medium text-fg-muted">{t(`content.weekday.${d}`)}</th>)}</tr>
              </thead>
              <tbody>
                {monthGrid(year, month).map((week, w) => (
                  <tr key={w}>
                    {week.map((d, i) => (
                      <td key={i} className="h-24 border border-line p-1 align-top">
                        {d ? (
                          <>
                            <span className="text-fg-muted">{Number(d.slice(8))}</span>
                            <ul className="mt-1 space-y-1">
                              {(byDay.get(d) ?? []).map((it) => (
                                <li key={it.id} dir="auto" title={it.title} className={`truncate rounded px-1 py-0.5 ${it.status === "published" ? "bg-success/15 text-success" : it.status === "scheduled" ? "bg-info/15 text-info" : "bg-surface-hover text-fg"}`}>
                                  {it.title}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-muted">{t("content.unscheduled", { count: shown.filter((i) => !i.planned_for && i.status !== "archived").length })}</p>
        </GlassPanel>
      )}
    </>
  );
}
