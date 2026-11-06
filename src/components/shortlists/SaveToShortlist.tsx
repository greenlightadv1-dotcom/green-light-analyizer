"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { addToShortlist } from "@/app/(app)/shortlists/actions";
import { PORTFOLIO_LIMITS } from "@/lib/portfolio/rules";
import { BTN_GHOST, BTN_PRIMARY, Labelled, SELECT_CLASS, TextInput } from "@/components/collab/ui";

/** Discover: save the selected creator to one of the company's own lists. */
export function SaveToShortlist({
  creatorId,
  creatorName,
  lists,
}: {
  creatorId: string;
  creatorName: string;
  lists: { id: string; name: string; hasCreator: boolean }[];
}) {
  const { t } = useTranslation();
  const open = lists.filter((l) => !l.hasCreator);
  return (
    <GlassPanel className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{t("shortlists.save")}</h2>
        <Link href="/shortlists" className="text-xs text-fg-muted underline hover:text-fg focus-visible:focus-ring">{t("shortlists.manage")}</Link>
      </div>
      {lists.some((l) => l.hasCreator) ? (
        <p className="text-xs text-fg-muted">
          {lists.filter((l) => l.hasCreator).map((l) => l.name).join(", ")}
        </p>
      ) : null}
      {lists.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {t("shortlists.noLists")} <Link href="/shortlists" className={`${BTN_GHOST} ms-2 h-8`}>{t("shortlists.newList")}</Link>
        </p>
      ) : open.length ? (
        <ConfirmActionForm
          action={addToShortlist}
          hidden={{ creator_id: creatorId }}
          trigger={{ labelKey: "shortlists.save" }}
          triggerClassName={BTN_PRIMARY}
          titleKey="shortlists.saveTitle"
          bodyKey="shortlists.saveBody"
          confirmKey="shortlists.saveConfirm"
          successKey="shortlists.saved"
          params={{ name: creatorName }}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Labelled id="sl-pick" labelKey="shortlists.pickList">
            <select id="sl-pick" name="shortlist_id" required className={SELECT_CLASS} defaultValue={open[0].id}>
              {open.map((l) => (
                <option key={l.id} value={l.id} className="bg-slate-900 text-white">{l.name}</option>
              ))}
            </select>
          </Labelled>
          <TextInput id="sl-note" name="note" labelKey="shortlists.note" maxLength={PORTFOLIO_LIMITS.note} />
        </ConfirmActionForm>
      ) : null}
    </GlassPanel>
  );
}
