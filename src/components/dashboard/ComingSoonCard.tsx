import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * "AI Assistant" teaser — CLAUDE.md §11.
 *
 * Roadmap surface: visible but deliberately NOT clickable. Rendered as a
 * non-interactive element (no button, no link, aria-disabled) so it is
 * genuinely locked rather than styled to look locked.
 */
const FEATURES = [
  "Video & script idea generation",
  "Copyright check",
  "Thumbnail idea generation",
  "Best posting time recommendations",
  "Verified audience geo for TikTok / Twitch, if those APIs open up",
];

export function ComingSoonCard() {
  return (
    <GlassPanel
      as="section"
      aria-disabled="true"
      className="relative overflow-hidden p-6 opacity-70 select-none"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">AI Assistant</h2>
        <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-green uppercase">
          Coming soon
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-fg/45">
            <span
              aria-hidden
              className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg/25"
            />
            {f}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
