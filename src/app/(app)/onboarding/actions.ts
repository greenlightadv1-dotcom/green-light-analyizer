"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { log } from "@/lib/log";
import { parseCompanyDetails } from "@/lib/company-details";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseClassification } from "@/lib/taxonomy";
import { getTaxonomy } from "@/lib/taxonomy-server";

export type SaveState = { error: string | null; saved: boolean; values?: Record<string, string> };

/** 42703: the 0024 columns do not exist yet on this database. */
const notMigrated = (code: string | undefined) => code === "42703" || code === "PGRST204";

/**
 * Creator classification (feature 3). Creator-only; values are checked
 * against the controlled taxonomy and written to the caller's own row.
 */
export async function saveClassification(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const profile = await requireProfile();
  if (profile.role !== "creator") return { error: "forbidden", saved: false };
  // Validated against the admin-managed taxonomy (0033). A term the profile
  // already holds stays acceptable after it is deactivated; new picks must be active.
  const parsed = parseClassification(
    {
      categories: formData.getAll("categories"),
      games: formData.getAll("games"),
      formats: formData.getAll("formats"),
      tags: formData.getAll("tags"),
    },
    await getTaxonomy(),
    {
      creator_categories: profile.creator_categories ?? [],
      creator_games: profile.creator_games ?? [],
      content_formats: profile.content_formats ?? [],
      creator_tags: profile.creator_tags ?? [],
    },
  );
  if (!parsed.ok) return { error: "invalid", saved: false };
  if (!parsed.value.creator_categories.length) return { error: "category_required", saved: false };

  // creator_tags exists only with 0033; never send it to a database without it.
  const { creator_tags, ...base } = parsed.value;
  const update = profile.creator_tags !== undefined ? parsed.value : base;
  if (profile.creator_tags === undefined && creator_tags.length) return { error: "not_available", saved: false };
  const { error } = await createAdminClient().from("profiles").update(update).eq("id", profile.id);
  if (error) {
    log.error("onboarding.classification_failed", { code: error.code });
    return { error: notMigrated(error.code) ? "not_available" : "failed", saved: false };
  }
  revalidatePath("/onboarding");
  revalidatePath("/media-kit");
  return { error: null, saved: true };
}

/**
 * Company details (feature 2). Company-only. The description is shown to
 * creators, so it may not carry contact details (§6): they are refused, not
 * silently masked, so the company knows why.
 */
export async function saveCompanyDetails(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const profile = await requireProfile();
  if (profile.role !== "company") return { error: "forbidden", saved: false };

  const values = Object.fromEntries(["full_name", "bio", "company_industry", "company_website"].map((k) => [k, String(formData.get(k) ?? "").trim()]));
  const fail = (error: string): SaveState => ({ error, saved: false, values });
  // Same rules as a representative with company.edit (lib/company-details.ts).
  const parsed = parseCompanyDetails(formData);
  if (!parsed.ok) return fail(parsed.error);
  const { full_name: fullName, bio, company_industry: industry, company_website: website } = parsed.value;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, bio, company_industry: industry, company_website: website || null })
    .eq("id", profile.id);
  if (error) {
    if (notMigrated(error.code)) {
      // Before 0024: store what the schema can hold, report the rest.
      const { error: e2 } = await admin.from("profiles").update({ full_name: fullName, bio }).eq("id", profile.id);
      if (!e2) {
        revalidatePath("/onboarding");
        return { error: "partially_saved", saved: true };
      }
    }
    log.error("onboarding.company_failed", { code: error.code });
    return fail("failed");
  }
  revalidatePath("/onboarding");
  return { error: null, saved: true };
}
