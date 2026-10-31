"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { JOURNEYS } from "@/lib/access-requests";

/**
 * Get Started (feature 1): the three journeys. Each leads to one application
 * form; there is no second registration path anywhere in the product.
 */
export function GetStartedChooser() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-5xl px-4 pt-16 pb-20 sm:px-6">
      <h1 className="text-center text-3xl font-bold tracking-tight text-ink sm:text-4xl dark:text-white">{t("getStarted.title")}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-ink/60 sm:text-base dark:text-white/60">{t("getStarted.intro")}</p>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {JOURNEYS.map((j) => (
          <li key={j}>
            <Link
              href={`/get-started/${j}`}
              className="glass-panel flex h-full flex-col p-6 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              <span className="text-base font-semibold text-fg">{t(`getStarted.journey.${j}.title`)}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-fg/60">{t(`getStarted.journey.${j}.body`)}</span>
              <span className="mt-5 text-sm font-semibold text-brand-green">{t("getStarted.choose")} →</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-xs text-ink/45 dark:text-white/40">
        {t("getStarted.reviewNote")}{" "}
        <Link href="/login" className="underline">
          {t("getStarted.haveAccount")}
        </Link>
      </p>
    </section>
  );
}
