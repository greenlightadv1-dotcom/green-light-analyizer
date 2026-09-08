import Link from "next/link";
import { ThemedLogo } from "@/components/landing/ThemedLogo";
import { ThemeToggle } from "@/components/landing/ThemeToggle";
import { CtaLink } from "@/components/landing/CtaLink";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

/**
 * Floating nav (spec point 2): inset from the viewport edges rather than
 * full-bleed, sticky, glass. Light/dark via `dark:` — everything else on the
 * public site follows the same pattern.
 */
export function LandingNav() {
  return (
    <div className="sticky top-4 z-40 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav className="flex items-center justify-between gap-4 rounded-2xl border border-navy/10 bg-white/70 px-4 py-3 shadow-[0_8px_30px_-16px_rgba(41,62,97,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-navy-dark/60 dark:shadow-[0_8px_30px_-16px_rgba(0,0,0,0.6)]">
        <Link href="/" aria-label="Green Light home">
          <ThemedLogo height={26} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <CtaLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            Sign in
          </CtaLink>
          <CtaLink href={DISCORD_INVITE_URL} external variant="primary">
            Request access
          </CtaLink>
        </div>
      </nav>
    </div>
  );
}
