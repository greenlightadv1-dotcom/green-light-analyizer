import type { Role, VerificationDocType, VerificationKind, VerificationStatus } from "../types/database.ts";

/**
 * Creator KYC, company KYB and representative authorization (migration
 * 0032): which fields and documents each kind needs, validation, and which
 * fields are already known from the profile so they are never asked twice.
 * Pure — tested in rules.test.ts.
 */

export type FieldDef = {
  key: string;
  required: boolean;
  max: number;
  /** "phone" | "url" | "date" | "text" | "country" */
  type: "text" | "phone" | "url" | "date" | "country";
  /** A value already held (profile or application) this field can be pre-filled from. */
  fromProfile?: "full_name" | "country" | "company_website" | "company_name";
};

export const FIELDS: Record<VerificationKind, FieldDef[]> = {
  creator_kyc: [
    { key: "legal_name", required: true, max: 120, type: "text", fromProfile: "full_name" },
    { key: "date_of_birth", required: true, max: 10, type: "date" },
    { key: "nationality", required: true, max: 2, type: "country", fromProfile: "country" },
    { key: "phone", required: true, max: 20, type: "phone" },
  ],
  company_kyb: [
    { key: "registered_name", required: true, max: 160, type: "text", fromProfile: "full_name" },
    { key: "registration_number", required: true, max: 60, type: "text" },
    { key: "tax_number", required: true, max: 60, type: "text" },
    { key: "country", required: true, max: 2, type: "country", fromProfile: "country" },
    { key: "website", required: false, max: 200, type: "url", fromProfile: "company_website" },
    { key: "social_links", required: false, max: 500, type: "text" },
    { key: "contact_name", required: true, max: 120, type: "text" },
    { key: "contact_phone", required: true, max: 20, type: "phone" },
  ],
  representative: [
    { key: "legal_name", required: true, max: 120, type: "text", fromProfile: "full_name" },
    { key: "phone", required: true, max: 20, type: "phone" },
    { key: "company_name", required: true, max: 160, type: "text", fromProfile: "company_name" },
    { key: "job_title", required: true, max: 120, type: "text" },
  ],
};

/**
 * Document types each kind accepts. `camera` types are captured with the
 * device camera on the page (no file picker, no gallery, no drag-and-drop);
 * `upload` types are ordinary documents such as a PDF of a commercial
 * register. `requiredAnyOf` mirrors what the database enforces at submission.
 */
export const DOCUMENTS: Record<VerificationKind, { camera: VerificationDocType[]; upload: VerificationDocType[]; allowed: VerificationDocType[]; requiredAnyOf: VerificationDocType[][] }> = {
  creator_kyc: {
    camera: ["selfie", "id_front", "id_back"],
    upload: [],
    allowed: ["selfie", "id_front", "id_back"],
    requiredAnyOf: [["selfie"], ["id_front"], ["id_back"]],
  },
  company_kyb: {
    camera: [],
    upload: ["commercial_register", "tax_card", "authorization_letter", "other"],
    allowed: ["commercial_register", "tax_card", "authorization_letter", "other"],
    requiredAnyOf: [["commercial_register"], ["tax_card"], ["authorization_letter"]],
  },
  representative: {
    camera: [],
    upload: ["authorization_letter", "other"],
    allowed: ["authorization_letter", "other"],
    requiredAnyOf: [["authorization_letter"]],
  },
};

/** Which kinds a role may open. A company account is either the company or a representative of one. */
export function kindsForRole(role: Role): VerificationKind[] {
  return role === "creator" ? ["creator_kyc"] : role === "company" ? ["company_kyb", "representative"] : [];
}

export const EDITABLE: VerificationStatus[] = ["draft", "needs_info"];

const PHONE = /^\+?[0-9][0-9 -]{6,18}$/;
const COUNTRY = /^[A-Z]{2}$/;

function validDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  const d = new Date(t);
  return d.toISOString().slice(0, 10) === v && d.getUTCFullYear() >= 1900 && t < Date.now();
}

/**
 * Validate a form for `kind`. Unknown keys are dropped. Returns the cleaned
 * details or the first field that failed (as a dictionary key suffix).
 * `requireAll` is true on submission; drafts may be partial.
 */
export function parseDetails(
  kind: VerificationKind,
  raw: Record<string, unknown>,
  { requireAll }: { requireAll: boolean },
): { ok: true; value: Record<string, string> } | { ok: false; field: string } {
  const out: Record<string, string> = {};
  for (const f of FIELDS[kind]) {
    let v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : "";
    if (f.type === "country") v = v.toUpperCase();
    if (!v) {
      if (requireAll && f.required) return { ok: false, field: f.key };
      continue;
    }
    if (v.length > f.max) return { ok: false, field: f.key };
    if (f.type === "phone" && !PHONE.test(v)) return { ok: false, field: f.key };
    if (f.type === "country" && !COUNTRY.test(v)) return { ok: false, field: f.key };
    if (f.type === "date" && !validDate(v)) return { ok: false, field: f.key };
    if (f.type === "url") {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, field: f.key };
      } catch {
        return { ok: false, field: f.key };
      }
    }
    out[f.key] = v;
  }
  return { ok: true, value: out };
}

/**
 * Pre-fill: a field already saved on the case wins; otherwise a value the
 * platform already holds on the profile is offered (never overwriting a
 * saved value, never marked as verified). Returns the values and which keys
 * still need the person's input.
 */
export function prefill(
  kind: VerificationKind,
  saved: Record<string, string>,
  profile: { full_name?: string | null; country?: string | null; company_website?: string | null; company_name?: string | null },
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of FIELDS[kind]) {
    const fromProfile = f.fromProfile ? (profile[f.fromProfile] ?? "").toString().trim() : "";
    const v = saved[f.key]?.trim() || fromProfile;
    if (v) values[f.key] = v;
    else if (f.required) missing.push(f.key);
  }
  return { values, missing };
}

/** Document sets still missing before submission. */
export function missingDocuments(kind: VerificationKind, present: VerificationDocType[]): VerificationDocType[][] {
  return DOCUMENTS[kind].requiredAnyOf.filter((set) => !set.some((d) => present.includes(d)));
}

const KNOWN = new Set(["not_found", "invalid_state", "documents_missing", "note_required", "not_allowed", "company_required", "invalid_input"]);
export function verificationErrorKey(message: string | null | undefined): string {
  const m = /verification:([a-z_]+)/.exec(message ?? "");
  return m && KNOWN.has(m[1]) ? `verification.errors.${m[1]}` : "ui.errors.generic";
}

/** Upload limits shared by the route and the UI. */
export const UPLOAD = { maxBytes: 5 * 1024 * 1024, mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const };
