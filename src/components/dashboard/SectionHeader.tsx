export function SectionHeader({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  /** Smaller title, for long data-driven titles such as a sender's address. */
  compact?: boolean;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      {/* min-w-0 + overflow-wrap: a long unbroken title (a sender's email in
          the deal room) wraps instead of widening the page on phones. */}
      <div className="min-w-0">
        <h1 className={`${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-bold [overflow-wrap:anywhere] text-fg`}>
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
