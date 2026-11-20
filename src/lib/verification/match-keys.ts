import { createHmac } from "node:crypto";
import type { VerificationKind } from "../types/database.ts";
import { FIELDS } from "./rules.ts";

/**
 * Duplicate-identity fingerprints (migration 0041).
 *
 * A value is normalised the same way every time, then fingerprinted with a
 * keyed HMAC-SHA256, so equal identities compare equal across cases without
 * the comparison table holding the value itself. The identity document number
 * is collected ONLY to be fingerprinted: its plaintext is never stored (the
 * case keeps a masked hint, `maskIdNumber`).
 *
 * Signals and what they are for:
 * - strong: `id_number`, `name_dob` (people), `registration_number`,
 *   `tax_number` (companies, with the country). They link enhanced review
 *   across applications in the database (a flagged person reapplying with a
 *   new email is still under enhanced review) and are shown to reviewers.
 * - weak: `phone`. Shown to reviewers as a warning only, because shared
 *   numbers are common (an office line, a family phone, a representative and
 *   the company they represent). It never triggers enhanced review.
 *
 * A match is a signal for a person to look at, never proof and never a
 * decision. Pure apart from the HMAC — tested in match-keys.test.ts.
 */

export type MatchSignal = "id_number" | "name_dob" | "phone" | "registration_number" | "tax_number";
export const STRONG_SIGNALS: MatchSignal[] = ["id_number", "name_dob", "registration_number", "tax_number"];

const ARABIC_INDIC = /[٠-٩۰-۹]/g;
const toAsciiDigits = (s: string) =>
  s.replace(ARABIC_INDIC, (d) => String((d.charCodeAt(0) & 0xf) % 10));

/** Digits only, international form. Egyptian local mobiles (01xxxxxxxxx) become 201xxxxxxxxx. */
export function normalizePhone(v: string): string | null {
  let d = toAsciiDigits(v).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^01[0125]\d{8}$/.test(d)) d = `2${d}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/**
 * A person's name, compared loosely: case, accents, Arabic diacritics and
 * letter variants (أ/إ/آ → ا, ى → ي, ة → ه), punctuation and spacing are
 * ignored. Word order is NOT ignored.
 */
export function normalizeName(v: string): string | null {
  const s = toAsciiDigits(v)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Latin accents
    .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return s.length >= 2 ? s : null;
}

/** Document and registration numbers: digits made ASCII, letters upper-case, separators dropped. */
export function normalizeIdentifier(v: string): string | null {
  const s = toAsciiDigits(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 4 && s.length <= 40 ? s : null;
}

/** What a reviewer and the applicant see of an ID number: never more than its last two characters. */
export const ID_MASK = "••••";
export function maskIdNumber(normalized: string): string {
  return `${ID_MASK}${normalized.slice(-2)}`;
}
export const isMaskedIdNumber = (v: string) => v.startsWith(ID_MASK);

/** The normalised values a case's details yield (the ID number is passed separately: it is never in the details). */
export function matchInputs(kind: VerificationKind, details: Record<string, string>): { signal: MatchSignal; value: string }[] {
  const out: { signal: MatchSignal; value: string }[] = [];
  const phone = normalizePhone(details[kind === "company_kyb" ? "contact_phone" : "phone"] ?? "");
  if (phone) out.push({ signal: "phone", value: phone });
  if (kind === "creator_kyc") {
    const name = normalizeName(details.legal_name ?? "");
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(details.date_of_birth ?? "") ? details.date_of_birth : null;
    if (name && dob) out.push({ signal: "name_dob", value: `${name}|${dob}` });
  }
  if (kind === "company_kyb") {
    const country = /^[A-Z]{2}$/.test(details.country ?? "") ? details.country : "";
    const reg = normalizeIdentifier(details.registration_number ?? "");
    const tax = normalizeIdentifier(details.tax_number ?? "");
    // Registration and tax numbers repeat between countries, so the country is part of the value.
    if (reg && country) out.push({ signal: "registration_number", value: `${country}:${reg}` });
    if (tax && country) out.push({ signal: "tax_number", value: `${country}:${tax}` });
  }
  return out;
}

/** Keyed fingerprint. The signal is part of the input, so equal values of different kinds never collide. */
export function fingerprint(key: Buffer, signal: MatchSignal, value: string): string {
  return createHmac("sha256", key).update(`${signal}\u0000${value}`).digest("hex");
}

/**
 * Prepare a step's form before it is merged into the case: the ID number is
 * fingerprinted (by `fp`) and replaced by its masked hint, so its plaintext
 * never reaches the database. The masked hint coming back unchanged from the
 * form means "keep what is stored".
 */
export function prepareIdNumberWith(
  kind: VerificationKind,
  raw: Record<string, string>,
  fp: (normalized: string) => string,
): { ok: true; raw: Record<string, string>; idFingerprint: string | null } | { ok: false; field: string } {
  const f = FIELDS[kind].find((x) => x.fingerprintOnly);
  if (!f || !(f.key in raw)) return { ok: true, raw, idFingerprint: null };
  const v = raw[f.key].trim();
  if (!v) return { ok: true, raw, idFingerprint: null };
  if (isMaskedIdNumber(v)) {
    const rest = { ...raw };
    delete rest[f.key];
    return { ok: true, raw: rest, idFingerprint: null };
  }
  const n = normalizeIdentifier(v);
  if (!n) return { ok: false, field: f.key };
  return { ok: true, raw: { ...raw, [f.key]: maskIdNumber(n) }, idFingerprint: fp(n) };
}
