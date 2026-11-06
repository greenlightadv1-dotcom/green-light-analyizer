import Link from "next/link";
import { GlassPanel } from "./GlassPanel";

/**
 * A screen or list with nothing to show yet: what will appear here and, when
 * there is one, the next step. Strings arrive already translated, so it
 * works in server and client components. Never put internal references
 * (spec sections, migration numbers, file paths) in either string.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <GlassPanel className="flex flex-col items-start gap-2 p-8">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-green" />
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-fg-muted">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-2 inline-flex h-10 items-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink transition hover:brightness-110 focus-visible:focus-ring"
        >
          {action.label}
        </Link>
      ) : null}
    </GlassPanel>
  );
}
