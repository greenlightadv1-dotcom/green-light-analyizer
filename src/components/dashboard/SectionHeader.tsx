export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      {/* min-w-0 + overflow-wrap: a long unbroken title (a sender's email in
          the deal room) wraps instead of widening the page on phones. */}
      <div className="min-w-0">
        <h1 className="text-3xl font-bold [overflow-wrap:anywhere] text-fg sm:text-4xl">
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
