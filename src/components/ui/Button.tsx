import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  // Electric neon green is the CTA colour (§2.1). Ink text keeps AA contrast
  // on such a bright fill — white would not.
  primary:
    "bg-brand-green text-ink hover:brightness-110 active:brightness-95 shadow-[0_8px_30px_-12px_rgba(98,232,35,0.7)]",
  ghost:
    "bg-white/5 text-white hover:bg-white/10 border border-white/10 backdrop-blur",
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green
        disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
