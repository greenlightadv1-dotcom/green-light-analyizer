"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealStatus } from "@/lib/types/database";
import { updateDealStatus } from "./actions";

/**
 * Deal status transitions. Mirrors updateDealStatus, which is the actual rule:
 * parties move between the four negotiating states, only an admin marks a deal
 * paid once escrow clears (§12), and a paid deal is closed to the parties.
 */
const OPTIONS: { value: DealStatus; labelKey: string }[] = [
  { value: "new", labelKey: "badges.statusNew" },
  { value: "negotiating", labelKey: "badges.statusNegotiating" },
  { value: "agreed", labelKey: "badges.statusAgreed" },
  { value: "disputed", labelKey: "badges.statusDisputed" },
];
const PAID = { value: "paid" as DealStatus, labelKey: "badges.statusPaid" };

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
  /** UI preview: render the control without wiring it to a server action. */
  demo?: boolean;
}) {
  const { t } = useTranslation();

  if (current === "paid" && !isAdmin) {
    return (
      <GlassPanel className="p-5">
        <h2 className="text-sm font-semibold text-fg">{t("inbox.updateStatus")}</h2>
        <p className="mt-3 text-xs leading-relaxed text-fg/50">{t("inbox.paidLockedNote")}</p>
      </GlassPanel>
    );
  }

  const options = isAdmin ? [...OPTIONS, PAID] : OPTIONS;

  return (
    <GlassPanel className="p-5">
      <h2 className="text-sm font-semibold text-fg">{t("inbox.updateStatus")}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <form
            key={option.value}
            action={demo ? undefined : updateDealStatus}
          >
            <input type="hidden" name="chat_id" value={chatId} />
            <input type="hidden" name="deal_status" value={option.value} />
            <button
              type={demo ? "button" : "submit"}
              disabled={current === option.value}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                current === option.value
                  ? "cursor-default border-brand-green/30 bg-brand-green/10 text-brand-green"
                  : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg"
              }`}
            >
              {t(option.labelKey)}
            </button>
          </form>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg/30">
        {t(isAdmin ? "inbox.markPaidAdminNote" : "inbox.markPaidNote")}
      </p>
    </GlassPanel>
  );
}
