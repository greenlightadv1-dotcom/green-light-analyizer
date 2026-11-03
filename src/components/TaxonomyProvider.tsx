"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SEED_TAXONOMY, termLabel, type TaxonomySnapshot } from "@/lib/taxonomy";

const Ctx = createContext<TaxonomySnapshot>(SEED_TAXONOMY);

/** Hands the server-loaded taxonomy (lib/taxonomy-server.ts) to every picker below it. */
export function TaxonomyProvider({ value, children }: { value: TaxonomySnapshot; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The snapshot plus a label function. A seeded id keeps its translated
 * dictionary label (all five languages); a term an admin added shows its
 * Arabic label in Arabic and its English label otherwise.
 */
export function useTaxonomy() {
  const snap = useContext(Ctx);
  const { t, locale } = useTranslation();
  const label = useCallback(
    (id: string) => {
      const term = snap.terms.find((x) => x.id === id);
      const key = term?.kind === "category" ? `taxonomy.category.${id}` : term?.kind === "format" ? `taxonomy.format.${id}` : term?.kind === "game" ? `taxonomy.game.${id}` : null;
      if (key) {
        const v = t(key);
        if (v !== key) return v;
      }
      return termLabel(snap, id, locale);
    },
    [snap, t, locale],
  );
  return { snap, label };
}
