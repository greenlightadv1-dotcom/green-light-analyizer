import type { DealStatus } from "@/lib/types/database";

const STYLES: Record<DealStatus, string> = {
  new: "bg-white/10 text-white/70",
  negotiating: "bg-sky-400/15 text-sky-200",
  agreed: "bg-brand-green/15 text-brand-green",
  paid: "bg-brand-green/25 text-brand-green",
  disputed: "bg-red-500/15 text-red-200",
};

const LABELS: Record<DealStatus, string> = {
  new: "New",
  negotiating: "Negotiating",
  agreed: "Agreed",
  paid: "Paid",
  disputed: "Disputed",
};

export function StatusBadge({ status }: { status: DealStatus | null }) {
  const s = status ?? "new";
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STYLES[s]}`}>
      {LABELS[s]}
    </span>
  );
}
