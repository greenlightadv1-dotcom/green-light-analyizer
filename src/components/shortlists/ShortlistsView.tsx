"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { createShortlist, deleteShortlist, removeFromShortlist, renameShortlist } from "@/app/(app)/shortlists/actions";
import { PORTFOLIO_LIMITS } from "@/lib/portfolio/rules";
import { day } from "@/lib/collab/display";
import type { ActionResult } from "@/lib/ui/action-result";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, TextInput } from "@/components/collab/ui";

export type ShortlistWithEntries = {
  id: string;
  name: string;
  entries: { creator_id: string; name: string; note: string | null; added_at: string }[];
};

function Result({ state, okKey }: { state: ActionResult | null; okKey: string }) {
  const { t } = useTranslation();
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}>
      {state.ok ? t(okKey) : t(state.errorKey)}
    </p>
  );
}

function RenameForm({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(renameShortlist, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="shortlist_id" value={id} />
      <div className="min-w-0 flex-1">
        <TextInput id={`rename-${id}`} name="name" labelKey="shortlists.name" required maxLength={PORTFOLIO_LIMITS.shortlistName[1]} defaultValue={name} />
      </div>
      <button type="submit" disabled={pending} className={BTN_GHOST}>{t("shortlists.rename")}</button>
      <div className="basis-full"><Result state={state} okKey="shortlists.renamed" /></div>
    </form>
  );
}

/** A company's private shortlists. */
export function ShortlistsView({ lists }: { lists: ShortlistWithEntries[] }) {
  const { t } = useTranslation();
  const [state, create, pending] = useActionState<ActionResult | null, FormData>(createShortlist, null);
  return (
    <>
      <SectionHeader title={t("shortlists.title")} description={t("shortlists.description")} />
      <GlassPanel className="mb-4 p-5">
        <form action={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <TextInput id="new-list" name="name" labelKey="shortlists.newList" required maxLength={PORTFOLIO_LIMITS.shortlistName[1]} />
          </div>
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>{t("shortlists.create")}</button>
          <div className="basis-full"><Result state={state} okKey="shortlists.created" /></div>
        </form>
      </GlassPanel>

      {lists.length === 0 ? (
        <EmptyState title={t("shortlists.empty")} body={t("shortlists.emptyBody")} action={{ href: "/discover", label: t("nav.discover") }} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lists.map((l) => (
            <GlassPanel key={l.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <h2 dir="auto" className="text-sm font-semibold [overflow-wrap:anywhere] text-fg">{l.name}</h2>
                <span className="text-xs text-fg-muted">{t("shortlists.count", { count: l.entries.length })}</span>
              </div>
              {l.entries.length === 0 ? (
                <p className="px-5 py-4 text-sm text-fg-muted">{t("shortlists.emptyList")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {l.entries.map((e) => (
                    <li key={e.creator_id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/discover?creator=${e.creator_id}`} className="font-medium text-fg underline-offset-2 hover:underline focus-visible:focus-ring">{e.name}</Link>
                        {e.note ? <p dir="auto" className="text-xs [overflow-wrap:anywhere] text-fg-secondary">{e.note}</p> : null}
                        <p className="text-xs text-fg-muted">{day(e.added_at)}</p>
                      </div>
                      <ConfirmActionForm
                        action={removeFromShortlist}
                        hidden={{ shortlist_id: l.id, creator_id: e.creator_id }}
                        trigger={{ labelKey: "shortlists.remove" }}
                        triggerClassName={`${BTN_GHOST} h-8`}
                        titleKey="shortlists.removeTitle"
                        bodyKey="shortlists.removeBody"
                        confirmKey="shortlists.removeConfirm"
                        params={{ name: e.name }}
                        tone="danger"
                        className="flex flex-wrap items-center gap-2"
                      />
                    </li>
                  ))}
                </ul>
              )}
              <details className="border-t border-line px-5 py-3">
                <summary className="cursor-pointer text-xs text-fg-muted">{t("shortlists.rename")} · {t("shortlists.delete")}</summary>
                <div className="mt-3 space-y-3">
                  <RenameForm id={l.id} name={l.name} />
                  <ConfirmActionForm
                    action={deleteShortlist}
                    hidden={{ shortlist_id: l.id }}
                    trigger={{ labelKey: "shortlists.delete" }}
                    triggerClassName={BTN_DANGER}
                    titleKey="shortlists.deleteTitle"
                    bodyKey="shortlists.deleteBody"
                    confirmKey="shortlists.deleteConfirm"
                    tone="danger"
                    className="flex flex-wrap items-center gap-2"
                  />
                </div>
              </details>
            </GlassPanel>
          ))}
        </div>
      )}
    </>
  );
}
