"use client";

import Link from "next/link";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { ThemeMenu } from "@/components/ui/ThemeMenu";
import { LanguageMenu } from "@/components/ui/LanguageMenu";
import { CtaLink } from "@/components/landing/CtaLink";
import { useTranslation } from "@/components/LocaleProvider";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

/**
 * Floating nav (spec point 2): inset from the viewport edges rather than
 * full-bleed, sticky, glass. Light/dark via `dark:` — everything else on the
 * public site follows the same pattern.
 */
export function LandingNav() {
  const { t } = useTranslation();

  return (
    <div className="sticky top-4 z-40 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav className="flex items-center justify-between gap-4 rounded-2xl border border-navy/10 bg-white/70 px-4 py-3 shadow-[0_8px_30px_-16px_rgba(41,62,97,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-navy-dark/60 dark:shadow-[0_8px_30px_-16px_rgba(0,0,0,0.6)]">
        <Link href="/" aria-label="Green Light home">
          <ThemedLogo size={30} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageMenu />
          <ThemeMenu />
          <CtaLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            {t("landing.ctaSignIn")}
          </CtaLink>
          <CtaLink href={DISCORD_INVITE_URL} external variant="primary">
            {t("landing.ctaRequestAccess")}
          </CtaLink>
        </div>
      </nav>
    </div>
  );
}
