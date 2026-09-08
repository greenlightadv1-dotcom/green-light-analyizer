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
        className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={`h-11 w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 text-sm text-fg
          placeholder:text-fg/30 transition
          focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none ${className}`}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-fg/45">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
