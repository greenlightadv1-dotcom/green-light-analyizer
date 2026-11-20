"use client";

import { useTranslation } from "@/components/LocaleProvider";

const VALUE_PROPS = [
  { titleKey: "landing.valueProp1Title", bodyKey: "landing.valueProp1Body" },
  { titleKey: "landing.valueProp2Title", bodyKey: "landing.valueProp2Body" },
  { titleKey: "landing.valueProp3Title", bodyKey: "landing.valueProp3Body" },
];

/** The three real value propositions (CLAUDE.md §1), as cards; the middle one is the lime highlight. */
export function ValueProps() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="grid gap-4 md:grid-cols-3">
        {VALUE_PROPS.map((prop, i) => {
          const lime = i === 1;
          return (
            <div key={prop.titleKey} className={`${lime ? "surface-lime" : "glass-panel"} p-7`}>
              <span
                aria-hidden
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                  lime ? "bg-ink text-brand-green" : "bg-forest-soft text-forest dark:text-info"
                }`}
              >
                0{i + 1}
              </span>
              <h3 className={`mt-6 text-xl font-bold ${lime ? "text-ink" : "text-fg"}`}>{t(prop.titleKey)}</h3>
              <p className={`mt-3 text-[15px] leading-relaxed ${lime ? "text-ink/75" : "text-fg-muted"}`}>
                {t(prop.bodyKey)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
