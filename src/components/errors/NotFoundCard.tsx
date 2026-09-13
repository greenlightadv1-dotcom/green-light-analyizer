"use client";

import Link from "next/link";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * The 404 body, split out as a client component so `not-found.tsx` can stay a
 * Server Component and keep its `metadata` export — a client boundary there
 * would forfeit the page title.
 *
 * Links to `/` rather than `/dashboard`: this page is reached by lost Green
 * Light users *and* by sponsors following a dead `/p/<slug>` profile link, who
 * have no account at all. The landing page is the one destination that makes
 * sense to both.
 */
export function NotFoundCard() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ThemedLogo size={48} />
        </div>

        <GlassPanel className="p-7 sm:p-8">
          <p className="font-mono text-xs tracking-widest text-fg/35 uppercase">404</p>
          <h1 className="mt-2 text-xl font-semibold text-fg">
            {t("errors.notFoundTitle")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-fg/55">
            {t("errors.notFoundBody")}
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand-green px-5 text-sm font-semibold text-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            {t("errors.backHome")}
          </Link>
        </GlassPanel>
      </div>
    </main>
  );
}
