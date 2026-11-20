"use client";

import Link from "next/link";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { ThemeMenu } from "@/components/ui/ThemeMenu";
import { LanguageMenu } from "@/components/ui/LanguageMenu";
import { CtaLink } from "@/components/landing/CtaLink";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * Floating pill nav, inset from the viewport edges and sticky. Colours come
 * from the semantic tokens, so it themes with the rest of the site.
 */
export function LandingNav() {
  const { t } = useTranslation();

  return (
    <div className="sticky top-4 z-40 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav className="glass-panel-solid flex items-center justify-between gap-3 rounded-full py-2 ps-5 pe-2">
        <Link href="/" aria-label="Green Light home" className="rounded-full focus-visible:focus-ring">
          <ThemedLogo size={30} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageMenu />
          <ThemeMenu />
          <CtaLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            {t("landing.ctaSignIn")}
          </CtaLink>
          <CtaLink href="/get-started" variant="primary">
            {t("landing.ctaRequestAccess")}
          </CtaLink>
        </div>
      </nav>
    </div>
  );
}
