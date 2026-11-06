import type { ReactNode } from "react";
import { TONE_CLASSES, type StatusTone } from "@/lib/ui/status";

/**
 * A status chip with one tone vocabulary (lib/ui/status.ts). Text is passed
 * in already translated, so this works in server and client components.
 * The dot is decorative; the label alone carries the meaning.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  className = "",
}: {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
