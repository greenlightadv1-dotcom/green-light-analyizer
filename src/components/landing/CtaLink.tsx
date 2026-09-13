import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  // Same recipe as ui/Button.tsx's "primary" — ink text for AA contrast on
  // the bright neon-green fill, in both themes.
  primary:
    "bg-brand-green text-ink hover:brightness-110 active:brightness-95 shadow-[0_8px_30px_-12px_rgba(98,232,35,0.7)]",
  ghost:
    "border border-navy/15 bg-navy/5 text-ink hover:bg-navy/10 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
};

/**
 * Landing-page CTA, styled like ui/Button.tsx but rendered as a link — the
 * landing page's CTAs navigate (to /login, or out to Discord/WhatsApp)
 * rather than submit a form, so a <button> isn't the right element.
 */
export function CtaLink({
  href,
  variant = "primary",
  external = false,
  className = "",
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  external?: boolean;
}) {
  const classes = `inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green
    ${VARIANTS[variant]} ${className}`;

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
