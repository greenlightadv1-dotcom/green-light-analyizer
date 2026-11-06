"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { deletePortfolioItem, movePortfolioItem, savePortfolioItem, savePublicVisibility } from "@/app/(app)/portfolio/actions";
import { PORTFOLIO_LIMITS, PORTFOLIO_PLATFORMS, VISIBILITY_FIELDS, type VisibilityField } from "@/lib/portfolio/rules";
import { day, PLATFORM_LABEL } from "@/lib/collab/display";
import type { ActionResult } from "@/lib/ui/action-result";
import type { PortfolioItem } from "@/lib/types/database";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Labelled, SELECT_CLASS, TextArea, TextInput } from "@/components/collab/ui";

function Result({ state, okKey }: { state: ActionResult | null; okKey: string }) {
  const { t } = useTranslation();
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
      {state.ok ? t(okKey) : t(state.errorKey)}
    </p>
  );
}

function ItemForm({ item, demo }: { item: PortfolioItem | null; demo: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(savePortfolioItem, null);
  const p = item?.id ?? "new";
  return (
    <form action={action} className="space-y-3">
      {item ? <input type="hidden" name="item_id" value={item.id} /> : null}
      <TextInput id={`pf-title-${p}`} name="title" labelKey="portfolio.fieldTitle" required minLength={PORTFOLIO_LIMITS.title[0]} maxLength={PORTFOLIO_LIMITS.title[1]} defaultValue={item?.title ?? ""} />
      <TextArea id={`pf-desc-${p}`} name="description" labelKey="portfolio.fieldDescription" hintKey="portfolio.contactNote" maxLength={PORTFOLIO_LIMITS.description} rows={3} defaultValue={item?.description ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id={`pf-url-${p}`} name="url" type="url" labelKey="portfolio.fieldUrl" dir="ltr" pattern="https://.*" maxLength={PORTFOLIO_LIMITS.url} defaultValue={item?.url ?? ""} />
        <Labelled id={`pf-platform-${p}`} labelKey="portfolio.fieldPlatform">
          <select id={`pf-platform-${p}`} name="platform" className={SELECT_CLASS} defaultValue={item?.platform ?? ""}>
            <option value="" className="bg-slate-900 text-white">{t("portfolio.platformNone")}</option>
            {PORTFOLIO_PLATFORMS.map((x) => (
              <option key={x} value={x} className="bg-slate-900 text-white">{x === "other" ? t("portfolio.platformOther") : PLATFORM_LABEL[x]}</option>
            ))}
          </select>
        </Labelled>
        <TextInput id={`pf-brand-${p}`} name="brand_name" labelKey="portfolio.fieldBrand" maxLength={PORTFOLIO_LIMITS.brand[1]} defaultValue={item?.brand_name ?? ""} />
        <TextInput id={`pf-date-${p}`} name="published_on" type="date" labelKey="portfolio.fieldDate" defaultValue={item?.published_on ?? ""} />
      </div>
      <label className="flex items-start gap-2 text-sm text-fg">
        <input type="checkbox" name="brand_name_public" defaultChecked={item?.brand_name_public} className="mt-1" />
        <span>
          {t("portfolio.fieldConsent")}
          <span className="block text-xs text-fg-muted">{t("portfolio.consentHint")}</span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="is_public" defaultChecked={item?.is_public} />
        {t("portfolio.fieldPublic")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || demo} className={BTN_PRIMARY}>{pending ? t("portfolio.saving") : t("portfolio.save")}</button>
        <Result state={state} okKey="portfolio.saved" />
      </div>
    </form>
  );
}

function MoveButton({ id, dir, disabled }: { id: string; dir: "up" | "down"; disabled: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(movePortfolioItem, null);
  return (
    <form action={action}>
      <input type="hidden" name="item_id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <button type="submit" disabled={disabled || pending} aria-label={t(dir === "up" ? "portfolio.moveUp" : "portfolio.moveDown")} className={`${BTN_GHOST} h-8 w-8 px-0`}>
        {dir === "up" ? "↑" : "↓"}
      </button>
      {state && !state.ok ? <span role="alert" className="text-xs text-danger">{t(state.errorKey)}</span> : null}
    </form>
  );
}

/** A creator's portfolio and the sections their public profile shows. */
export function PortfolioView({
  items,
  visibility,
  publicPath,
  demo = false,
}: {
  items: PortfolioItem[];
  visibility: Record<VisibilityField, boolean>;
  publicPath: string | null;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [visState, saveVis, savingVis] = useActionState<ActionResult | null, FormData>(savePublicVisibility, null);
  return (
    <>
      <SectionHeader title={t("portfolio.title")} description={t("portfolio.description")} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <GlassPanel className="p-5">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-fg">{t("portfolio.add")}</summary>
              <div className="mt-4"><ItemForm item={null} demo={demo} /></div>
            </details>
          </GlassPanel>
          {items.length === 0 ? (
            <EmptyState title={t("portfolio.empty")} body={t("portfolio.emptyBody")} />
          ) : (
            <GlassPanel className="overflow-hidden">
              <ul className="divide-y divide-line">
                {items.map((it, i) => (
                  <li key={it.id} className="space-y-2 px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{it.title}</p>
                        <p className="text-xs text-fg-muted">
                          {[it.platform ? (it.platform === "other" ? t("portfolio.platformOther") : PLATFORM_LABEL[it.platform]) : "", day(it.published_on)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={it.is_public ? "success" : "neutral"}>{t(it.is_public ? "portfolio.public" : "portfolio.private")}</StatusBadge>
                        {!demo ? (
                          <>
                            <MoveButton id={it.id} dir="up" disabled={i === 0} />
                            <MoveButton id={it.id} dir="down" disabled={i === items.length - 1} />
                          </>
                        ) : null}
                      </div>
                    </div>
                    {it.description ? <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-secondary">{it.description}</p> : null}
                    {it.brand_name ? (
                      <p className="text-xs text-fg-muted">
                        <span dir="auto">{it.brand_name}</span>
                        {!it.brand_name_public ? ` · ${t("portfolio.brandPrivate")}` : ""}
                      </p>
                    ) : null}
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="block break-all text-xs text-info underline">{it.url}</a>
                    ) : null}
                    <details className="rounded-control border border-line p-3">
                      <summary className="cursor-pointer text-xs text-fg-muted">{t("portfolio.edit")}</summary>
                      <div className="mt-3 space-y-3">
                        <ItemForm item={it} demo={demo} />
                        <ConfirmActionForm
                          action={deletePortfolioItem}
                          hidden={{ item_id: it.id }}
                          trigger={{ labelKey: "portfolio.delete" }}
                          triggerClassName={BTN_DANGER}
                          titleKey="portfolio.deleteTitle"
                          bodyKey="portfolio.deleteBody"
                          confirmKey="portfolio.deleteConfirm"
                          tone="danger"
                          className="flex flex-wrap items-center gap-2"
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          )}
        </div>

        <GlassPanel className="h-fit space-y-3 p-5">
          <h2 className="text-sm font-semibold text-fg">{t("portfolio.visTitle")}</h2>
          <p className="text-xs leading-relaxed text-fg-muted">{t("portfolio.visBody")}</p>
          <form action={saveVis} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("portfolio.visTitle")}</legend>
              {VISIBILITY_FIELDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-fg">
                  <input type="checkbox" name="show" value={k} defaultChecked={visibility[k]} />
                  {t(`portfolio.vis.${k}`)}
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={savingVis || demo} className={BTN_PRIMARY}>{t("portfolio.visSave")}</button>
            <Result state={visState} okKey="portfolio.visSaved" />
          </form>
          {publicPath ? (
            <a href={publicPath} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} w-full`}>{t("portfolio.viewPublic")}</a>
          ) : (
            <p className="text-xs text-fg-muted">{t("portfolio.noSlug")}</p>
          )}
        </GlassPanel>
      </div>
    </>
  );
}
