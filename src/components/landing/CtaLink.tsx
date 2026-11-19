import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/Button";

type Variant = "primary" | "secondary" | "outline" | "ghost";

/**
 * A link that looks like ui/Button. The landing page's CTAs navigate (to
 * /login, /get-started, or out to Discord/WhatsApp) rather than submit a
 * form, so a <button> isn't the right element.
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
  const classes = `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
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
