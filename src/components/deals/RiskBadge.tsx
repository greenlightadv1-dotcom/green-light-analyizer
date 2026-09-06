import type { AiEvaluation } from "@/lib/types/database";

/**
 * The §1 "Deal Co-Pilot" risk rating: green | yellow | red.
 *
 * `capped` marks a rating the §7.4 verification rule downgraded — the engine
 * said green, but the geography behind it is self-reported and the deal is
 * high-value. That distinction is the product's anti-fraud promise made
 * visible, so it is shown rather than quietly applied.
 */
const STYLES: Record<AiEvaluation, string> = {
  green: "border-brand-green/30 bg-brand-green/10 text-brand-green",
  yellow: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  red: "border-red-400/30 bg-red-500/10 text-red-200",
};

const LABELS: Record<AiEvaluation, string> = {
  green: "Green light",
  yellow: "Proceed with care",
  red: "High risk",
};

export function RiskBadge({
  risk,
  capped = false,
  className = "",
}: {
  risk: AiEvaluation | null;
  capped?: boolean;
  className?: string;
}) {
  if (!risk) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/40 ${className}`}
      >
        Not evaluated
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[risk]} ${className}`}
      title={
        capped
          ? "Capped at yellow: the audience data behind this rating is self-reported, and the deal is high-value (§7.4)."
          : undefined
      }
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[risk]}
      {capped ? <span className="opacity-70">· capped</span> : null}
    </span>
  );
}
