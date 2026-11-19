import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

/**
 * Pill buttons (2026-11 identity). `primary` is the lime CTA with ink text
 * (white on #62E823 fails contrast); `secondary` is deep forest; `outline`
 * and `ghost` are the quiet options; `danger` is for destructive actions.
 */
export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-green text-ink hover:bg-[#57d61d] active:bg-[#4fc419]",
  secondary: "bg-forest text-white hover:bg-forest-strong dark:bg-brand-green dark:text-ink dark:hover:bg-[#57d61d]",
  outline: "border border-line-strong bg-surface text-fg hover:bg-surface-hover",
  ghost: "bg-transparent text-fg hover:bg-surface-hover",
  danger: "bg-danger text-white hover:brightness-110 dark:text-ink",
};

export const BUTTON_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  fullWidth = true,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /**
   * Width is a prop rather than a utility class callers append, because
   * Tailwind orders utilities by its own rules: adding "w-auto" to a base
   * string containing "w-full" is not guaranteed to win, and quietly did not.
   */
  fullWidth?: boolean;
}) {
  return (
    <button
      className={`${BUTTON_BASE} ${fullWidth ? "w-full" : "w-auto shrink-0"} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
