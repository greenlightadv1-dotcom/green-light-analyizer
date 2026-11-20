import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { log } from "@/lib/log";
import { SEED_TAXONOMY, type TaxonomySnapshot, type TaxonomyTerm } from "@/lib/taxonomy";

/**
 * The taxonomy for this request (0033), loaded once and shared by every
 * server component and action. Falls back to the seed (the same ids the
 * migration inserts) when the table is absent, so a database without 0033
 * behaves exactly as before.
 */
export const getTaxonomy = cache(async (): Promise<TaxonomySnapshot> => {
  if (!isSupabaseConfigured()) return SEED_TAXONOMY;
  const { data, error } = await createAdminClient()
    .from("taxonomy_terms")
    .select("id, kind, parent_id, label_en, label_ar, description_en, description_ar, active, sort_order")
    .order("sort_order");
  if (error || !data?.length) {
    if (error && error.code !== "42P01" && error.code !== "PGRST205") log.warn("taxonomy.load_failed", { code: error.code });
    return SEED_TAXONOMY;
  }
  return { source: "database", terms: data as TaxonomyTerm[] };
});
