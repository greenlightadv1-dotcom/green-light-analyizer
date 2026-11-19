import type { VerificationKind } from "../types/database.ts";

/**
 * Duplicate-identity SIGNALS for a reviewer (never an automatic decision):
 * which stored values of a case another case or application also uses.
 * Pure, tested in duplicates.test.ts; the reviewer-only page runs the queries.
 *
 * - the WhatsApp number (stored normalised, without spaces or dashes);
 * - a person's legal name together with their date of birth;
 * - a company's registration number, and its tax number.
 *
 * A match can be innocent (a shared office phone, a re-application after a
 * rejection), which is why it is shown, not enforced.
 */
export type DuplicateKey = { label: "phone" | "name_dob" | "registration_number" | "tax_number"; match: Record<string, string> };

export function duplicateKeys(kind: VerificationKind, details: Record<string, string>): DuplicateKey[] {
  const out: DuplicateKey[] = [];
  const v = (k: string) => details[k]?.trim() ?? "";
  const phone = v(kind === "company_kyb" ? "contact_phone" : "phone");
  if (phone) out.push({ label: "phone", match: { [kind === "company_kyb" ? "contact_phone" : "phone"]: phone } });
  if (kind === "creator_kyc" && v("legal_name") && v("date_of_birth")) out.push({ label: "name_dob", match: { legal_name: v("legal_name"), date_of_birth: v("date_of_birth") } });
  if (kind === "company_kyb" && v("registration_number")) out.push({ label: "registration_number", match: { registration_number: v("registration_number") } });
  if (kind === "company_kyb" && v("tax_number")) out.push({ label: "tax_number", match: { tax_number: v("tax_number") } });
  return out;
}
