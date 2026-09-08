import { GlassPanel } from "@/components/ui/GlassPanel";
import type { DealStatus } from "@/lib/types/database";
import { updateDealStatus } from "./actions";

/**
 * Deal status transitions available to a creator.
 *
 * 'paid' is absent by design: §12 routes settlement through manual escrow
 * reconciliation, and the RLS UPDATE policy on deal_chats rejects a creator
 * writing it. Rendering the option would only produce a database error.
 */
const OPTIONS: { value: DealStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "negotiating", label: "Negotiating" },
  { value: "agreed", label: "Agreed" },
  { value: "disputed", label: "Disputed" },
];

export function StatusControl({
  chatId,
  current,
  demo = false,
}: {
  chatId: string;
  current: DealStatus;
  /** UI preview: render the control without wiring it to a server action. */
  demo?: boolean;
}) {
  return (
    <GlassPanel className="p-5">
      <h2 className="text-sm font-semibold text-fg">Update status</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
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
              {option.label}
            </button>
          </form>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg/30">
        Marking a deal paid is done by Green Light once escrow clears, not from
        here.
      </p>
    </GlassPanel>
  );
}
