"use client";

import { useTranslation } from "@/components/LocaleProvider";

const VALUE_PROPS = [
  { titleKey: "landing.valueProp1Title", bodyKey: "landing.valueProp1Body" },
  { titleKey: "landing.valueProp2Title", bodyKey: "landing.valueProp2Body" },
  { titleKey: "landing.valueProp3Title", bodyKey: "landing.valueProp3Body" },
];

/** Glassmorphism cards (spec point 2) grounded in CLAUDE.md §1's real value props, not generic filler. */
export function ValueProps() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {VALUE_PROPS.map((prop) => (
          <div
            key={prop.titleKey}
            className="rounded-2xl border border-navy/10 bg-white/70 p-6 shadow-[0_8px_30px_-20px_rgba(41,62,97,0.4)] backdrop-blur-xl dark:border-white/10 dark:bg-navy/25 dark:shadow-none"
          >
            <h3 className="text-sm font-semibold text-ink dark:text-white">
              {t(prop.titleKey)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60 dark:text-white/55">
              {t(prop.bodyKey)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
