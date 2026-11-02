"use client";

import { useState, useTransition } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealStatus } from "@/lib/types/database";
import { DEAL_STATUS_LABEL_KEY, dealStatusChangeNeedsConfirm } from "@/lib/ui/status";
import { updateDealStatus } from "./actions";

/**
 * Deal status transitions. Mirrors updateDealStatus, which is the actual rule:
 * parties move between the four negotiating states, only an admin marks a deal
 * paid once escrow clears, and a paid deal is closed to the parties.
 *
 * Every change asks first (the other party sees it, and "paid" is final for
 * them). The dialog stays open while the request runs, shows the server's
 * error if it fails, and "Status updated" appears only after it succeeded.
 */
const OPTIONS: DealStatus[] = ["new", "negotiating", "agreed", "disputed"];

export function StatusControl({
  chatId,
  current,
  isAdmin = false,
  demo = false,
}: {
  chatId: string;
  current: DealStatus;
  /** Admins get the 'paid' option — the escrow reconciliation step. */
  isAdmin?: boolean;
  /** UI preview: the dialog works, but nothing is sent to the server. */
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<DealStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (current === "paid" && !isAdmin) {
    return (
      <GlassPanel className="p-5">
        <h2 className="text-sm font-semibold text-fg">{t("inbox.updateStatus")}</h2>
        <p className="mt-3 text-xs leading-relaxed text-fg-muted">{t("inbox.paidLockedNote")}</p>
      </GlassPanel>
    );
  }

  const options: DealStatus[] = isAdmin ? [...OPTIONS, "paid"] : OPTIONS;

  const confirm = () => {
    if (!target) return;
    setError(null);
    if (demo) {
      setTarget(null);
      setDone(true);
      return;
    }
    const data = new FormData();
    data.set("chat_id", chatId);
    data.set("deal_status", target);
    startTransition(async () => {
      try {
        const result = await updateDealStatus(null, data);
        if (result.ok) {
          setTarget(null);
          setDone(true);
        } else {
          setError(t(result.errorKey));
        }
      } catch {
        setError(t("ui.errors.network"));
      }
    });
  };

  return (
    <GlassPanel className="p-5">
      <h2 className="text-sm font-semibold text-fg">{t("inbox.updateStatus")}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const isCurrent = current === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isCurrent}
              disabled={isCurrent}
              onClick={() => {
                if (!dealStatusChangeNeedsConfirm(current, option)) return;
                setDone(false);
                setError(null);
                setTarget(option);
              }}
              className={`rounded-chip border px-2.5 py-1.5 text-xs transition focus-visible:focus-ring ${
                isCurrent
                  ? "cursor-default border-success/30 bg-success/10 text-success"
                  : "border-line bg-surface-muted text-fg-secondary hover:bg-surface-hover hover:text-fg"
              }`}
            >
              {t(DEAL_STATUS_LABEL_KEY[option])}
            </button>
          );
        })}
      </div>

      {done ? (
        <p role="status" className="mt-3 text-xs text-success">
          {t("dealStatus.changed")}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
        {t(isAdmin ? "inbox.markPaidAdminNote" : "inbox.markPaidNote")}
      </p>

      <ConfirmDialog
        open={target !== null}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
        title={t("dealStatus.confirmTitle", { status: target ? t(DEAL_STATUS_LABEL_KEY[target]) : "" })}
        body={t(target === "paid" ? "dealStatus.confirmBodyPaid" : "dealStatus.confirmBody")}
        confirmLabel={t("dealStatus.confirmButton")}
        pending={pending}
        error={error}
      />
    </GlassPanel>
  );
}
