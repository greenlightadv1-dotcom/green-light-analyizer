"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { log } from "@/lib/log";
import { maskSensitiveData } from "@/lib/mask";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseClassification } from "@/lib/taxonomy";

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
  const parsed = parseClassification({
    categories: formData.getAll("categories"),
    games: formData.getAll("games"),
    formats: formData.getAll("formats"),
  });
  if (!parsed.ok) return { error: "invalid", saved: false };
  if (!parsed.value.creator_categories.length) return { error: "category_required", saved: false };

  const { error } = await createAdminClient().from("profiles").update(parsed.value).eq("id", profile.id);
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

  const fullName = String(formData.get("full_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const industry = String(formData.get("company_industry") ?? "").trim();
  let website = String(formData.get("company_website") ?? "").trim();
  const values = { full_name: fullName, bio, company_industry: industry, company_website: website };
  const fail = (error: string): SaveState => ({ error, saved: false, values });

  if (fullName.length < 2 || fullName.length > 120) return fail("name");
  if (!bio || bio.length > 600) return fail("bio");
  if (maskSensitiveData(bio).isMasked) return fail("contact_details");
  if (!industry || industry.length > 60) return fail("industry");
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".") || website.length > 200) {
        return fail("website");
      }
    } catch {
      return fail("website");
    }
  }

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
