import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * Placeholder for the surfaces scaffolded but not yet built (deal chat rooms,
 * manual analyzer, media kit). Each one names the spec section it will be
 * built from so the next pass has no ambiguity about scope.
 */
export function EmptyState({
  title,
  body,
  spec,
}: {
  title: string;
  body: string;
  /** e.g. "§5.1" — the CLAUDE.md section this screen implements. */
  spec?: string;
}) {
  return (
    <GlassPanel className="flex flex-col items-start gap-2 p-8">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {spec ? (
          <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40">
            {spec}
          </span>
        ) : null}
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-white/45">{body}</p>
    </GlassPanel>
  );
}
