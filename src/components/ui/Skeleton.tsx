/**
 * Loading placeholders. Hidden from assistive tech; the surrounding region
 * announces loading once (see LoadingRegion), not once per grey bar.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`gl-skeleton rounded-chip bg-surface-hover ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** A busy region with one announcement for screen readers. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
