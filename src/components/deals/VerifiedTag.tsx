/**
 * §7.2 requires that the UI *always* labels which geography it is showing.
 * Verified means it came from an Analytics/Insights API the creator connected
 * over OAuth. Self-reported means the creator typed it. Never render audience
 * geography without one of these next to it.
 */
export function VerifiedTag({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand-green/30 bg-brand-green/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-green uppercase">
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-200 uppercase">
      Self-reported
    </span>
  );
}
