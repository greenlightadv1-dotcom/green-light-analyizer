import { maskSensitiveData } from "./mask.ts";

/**
 * Validation of a company's public details. Shared by the company's own
 * onboarding form and by a representative holding company.edit (0034), so
 * both paths enforce the same rules, including the §6 rule that the
 * description shown to creators may not carry contact details.
 *
 * Pure — tested in company-access.test.ts.
 */
export type CompanyDetails = { full_name: string; bio: string; company_industry: string; company_website: string | null };

export function parseCompanyDetails(f: { get(k: string): unknown }): { ok: true; value: CompanyDetails } | { ok: false; error: string } {
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const fullName = s("full_name");
  const bio = s("bio");
  const industry = s("company_industry");
  let website = s("company_website");
  if (fullName.length < 2 || fullName.length > 120) return { ok: false, error: "name" };
  if (!bio || bio.length > 600) return { ok: false, error: "bio" };
  if (maskSensitiveData(bio).isMasked) return { ok: false, error: "contact_details" };
  if (!industry || industry.length > 60) return { ok: false, error: "industry" };
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".") || website.length > 200) return { ok: false, error: "website" };
    } catch {
      return { ok: false, error: "website" };
    }
  }
  return { ok: true, value: { full_name: fullName, bio, company_industry: industry, company_website: website || null } };
}
