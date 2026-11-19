"use client";

import { CtaLink } from "@/components/landing/CtaLink";
import { useTranslation } from "@/components/LocaleProvider";

const STEPS = [
  { title: "landing.how1Title", body: "landing.how1Body" },
  { title: "landing.how2Title", body: "landing.how2Body" },
  { title: "landing.how3Title", body: "landing.how3Body" },
] as const;

/**
 * Hero: a large confident headline on the warm canvas, and a deep-forest card
 * describing how a deal moves through the product. The card is a process
 * description, not sample data, so nothing on it can be mistaken for a real
 * figure.
 */
export function Hero() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pb-24">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-fg-secondary ring-1 ring-line">
          <span aria-hidden className="h-2 w-2 rounded-full bg-brand-green" />
          {t("landing.badge")}
        </p>

        <h1 className="mt-6 text-5xl leading-[1.04] font-bold text-fg sm:text-6xl lg:text-7xl">
          {t("landing.headline")}
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">
          {t("landing.subheadline")}
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <CtaLink href="/get-started" variant="primary" className="h-12 px-7 text-base sm:w-auto">
            {t("landing.ctaRequestAccess")}
          </CtaLink>
          <CtaLink href="/login" variant="outline" className="h-12 px-7 text-base sm:w-auto">
            {t("landing.ctaSignIn")}
          </CtaLink>
        </div>

        <p className="mt-4 text-sm text-fg-muted">{t("landing.noSignupNote")}</p>
      </div>

      <div className="surface-forest p-7 sm:p-9">
        <h2 className="text-sm font-semibold text-white/70">{t("landing.howTitle")}</h2>
        <ol className="mt-6 space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green text-base font-bold text-ink"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white">{t(step.title)}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/70">{t(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
