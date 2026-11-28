import { badgeText } from "@/lib/notifications/rules";

/**
 * The green "something new here" light: a small pulsing dot with the count
 * beside a nav link or list row. Renders nothing at zero. The count is
 * visible; screen readers get the label passed in.
 */
export function NotificationDot({
  count,
  label,
  className = "",
  showCount = true,
}: {
  count: number;
  label: string;
  className?: string;
  /** False for a bare light, where the row itself is the one new thing. */
  showCount?: boolean;
}) {
  const text = badgeText(count);
  if (!text) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span aria-hidden className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-green opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-green" />
      </span>
      {showCount ? (
        <span aria-hidden className="min-w-4 rounded-full bg-brand-green px-1 text-center text-[10px] leading-4 font-semibold text-ink">
          {text}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}
