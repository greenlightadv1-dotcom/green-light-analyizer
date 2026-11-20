import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  id,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg-secondary"
      >
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={`h-11 w-full rounded-control border border-line-strong bg-surface px-3.5 text-sm text-fg
          placeholder:text-fg-subtle transition
          focus:border-forest focus:ring-3 focus:ring-brand-green/30 focus:outline-none dark:focus:border-brand-green ${className}`}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
