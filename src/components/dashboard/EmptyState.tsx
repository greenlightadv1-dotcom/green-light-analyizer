import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * A titled, quiet panel for a screen or list that has nothing to show yet.
 * The copy should say what will appear here and, where there is one, what
 * the user can do next. Never put internal references (spec sections,
 * migration numbers, file paths) in either string: this is user-facing.
 */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <GlassPanel className="flex flex-col items-start gap-2 p-8">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-fg/45">{body}</p>
    </GlassPanel>
  );
}
