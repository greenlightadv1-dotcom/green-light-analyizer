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
        className="block text-xs font-medium tracking-wide text-white/70 uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={`h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white
          placeholder:text-white/30 transition
          focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none ${className}`}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-white/45">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
