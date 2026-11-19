import type { Role, VerificationDocType, VerificationKind, VerificationStatus } from "../types/database.ts";
import { CONTENT_CATEGORIES } from "../taxonomy.ts";

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
  type: "text" | "phone" | "url" | "date" | "country" | "select" | "multiselect" | "handle" | "urls" | "textarea";
  /** For select / multiselect: the allowed values (labels come from the dictionary). */
  options?: readonly string[];
  /** For multiselect: at most this many values. */
  maxItems?: number;
  /** A value already held (profile or application) this field can be pre-filled from. */
  fromProfile?: "full_name" | "country" | "company_website" | "company_name" | "primary_platform" | "channel_handle";
};

/** Platforms a creator can name as their main one (labels: verification.option.platform.*). */
export const MAIN_PLATFORMS = ["youtube", "twitch", "kick", "instagram", "tiktok", "x"] as const;
export const MAX_CATEGORIES = 3;

export const FIELDS: Record<VerificationKind, FieldDef[]> = {
  creator_kyc: [
    { key: "legal_name", required: true, max: 120, type: "text", fromProfile: "full_name" },
    { key: "date_of_birth", required: true, max: 10, type: "date" },
    { key: "nationality", required: true, max: 2, type: "country", fromProfile: "country" },
    // A WhatsApp contact number. Collected, never verified by OTP or SMS.
    { key: "phone", required: true, max: 20, type: "phone" },
    { key: "main_platform", required: true, max: 20, type: "select", options: MAIN_PLATFORMS, fromProfile: "primary_platform" },
    { key: "handle", required: true, max: 60, type: "handle", fromProfile: "channel_handle" },
    { key: "profile_links", required: false, max: 600, type: "urls" },
    { key: "categories", required: true, max: 200, type: "multiselect", options: CONTENT_CATEGORIES, maxItems: MAX_CATEGORIES },
  ],
  company_kyb: [
    { key: "registered_name", required: true, max: 160, type: "text", fromProfile: "full_name" },
    { key: "registration_number", required: true, max: 60, type: "text" },
    { key: "tax_number", required: true, max: 60, type: "text" },
    { key: "country", required: true, max: 2, type: "country", fromProfile: "country" },
    { key: "business_activity", required: true, max: 500, type: "textarea" },
    { key: "website", required: false, max: 200, type: "url", fromProfile: "company_website" },
    { key: "social_links", required: false, max: 600, type: "urls" },
    // The person authorized to act for the company (the applicant, or the person who signs for it).
    { key: "contact_name", required: true, max: 120, type: "text" },
    { key: "contact_title", required: true, max: 120, type: "text" },
    { key: "contact_phone", required: true, max: 20, type: "phone" },
  ],
  representative: [
    { key: "legal_name", required: true, max: 120, type: "text", fromProfile: "full_name" },
    { key: "phone", required: true, max: 20, type: "phone" },
    { key: "company_name", required: true, max: 160, type: "text", fromProfile: "company_name" },
    { key: "company_website", required: false, max: 200, type: "url", fromProfile: "company_website" },
    { key: "job_title", required: true, max: 120, type: "text" },
  ],
};

/**
 * Document types each kind accepts. `camera` types are captured with the
 * device camera on the page (no file picker, no gallery, no drag-and-drop);
 * `upload` types are ordinary documents such as a PDF of a commercial
 * register. `requiredAnyOf` mirrors what the database enforces at submission
 * for every case; `requiredForApplication` is enforced only for a case that
 * belongs to an application (0039: an existing account keeps its photo in
 * its profile).
 *
 * `profile_photo` is the creator's PUBLIC photo. It is a separate document
 * type from the identity images, is never captured by the identity camera
 * flow, and becomes the public avatar only at activation.
 */
export const DOCUMENTS: Record<
  VerificationKind,
  { camera: VerificationDocType[]; upload: VerificationDocType[]; allowed: VerificationDocType[]; requiredAnyOf: VerificationDocType[][]; requiredForApplication: VerificationDocType[][] }
> = {
  creator_kyc: {
    camera: ["selfie", "id_front", "id_back"],
    upload: ["profile_photo"],
    allowed: ["selfie", "id_front", "id_back", "profile_photo"],
    requiredAnyOf: [["selfie"], ["id_front"], ["id_back"]],
    requiredForApplication: [["profile_photo"]],
  },
  company_kyb: {
    camera: [],
    upload: ["commercial_register", "tax_card", "authorization_letter", "other"],
    allowed: ["commercial_register", "tax_card", "authorization_letter", "other"],
    requiredAnyOf: [["commercial_register"], ["tax_card"], ["authorization_letter"]],
    requiredForApplication: [],
  },
  representative: {
    camera: ["selfie", "id_front", "id_back"],
    upload: ["authorization_letter", "other"],
    allowed: ["selfie", "id_front", "id_back", "authorization_letter", "other"],
    requiredAnyOf: [["selfie"], ["id_front"], ["id_back"], ["authorization_letter"]],
    requiredForApplication: [],
  },
};

/** Document types that must be images (never PDF). */
export const IMAGE_ONLY: VerificationDocType[] = ["profile_photo"];

export type StepId = "personal" | "public" | "identity" | "company" | "presence" | "authorized" | "documents" | "represented" | "authorization" | "review";
export type StepDef = { id: StepId; fields: string[]; docs: VerificationDocType[] };

/**
 * The multi-step journey of each kind. Every field and document belongs to
 * exactly one step (rules.test.ts checks it); the last step is the review.
 */
export const STEPS: Record<VerificationKind, StepDef[]> = {
  creator_kyc: [
    { id: "personal", fields: ["legal_name", "date_of_birth", "nationality", "phone"], docs: [] },
    { id: "public", fields: ["main_platform", "handle", "profile_links", "categories"], docs: ["profile_photo"] },
    { id: "identity", fields: [], docs: ["selfie", "id_front", "id_back"] },
    { id: "review", fields: [], docs: [] },
  ],
  company_kyb: [
    { id: "company", fields: ["registered_name", "registration_number", "tax_number", "country", "business_activity"], docs: [] },
    { id: "presence", fields: ["website", "social_links"], docs: [] },
    { id: "authorized", fields: ["contact_name", "contact_title", "contact_phone"], docs: [] },
    { id: "documents", fields: [], docs: ["commercial_register", "tax_card", "authorization_letter", "other"] },
    { id: "review", fields: [], docs: [] },
  ],
  representative: [
    { id: "personal", fields: ["legal_name", "phone"], docs: [] },
    { id: "represented", fields: ["company_name", "company_website", "job_title"], docs: [] },
    { id: "identity", fields: [], docs: ["selfie", "id_front", "id_back"] },
    { id: "authorization", fields: [], docs: ["authorization_letter", "other"] },
    { id: "review", fields: [], docs: [] },
  ],
};

/** Which kinds a role may open. A company account is either the company or a representative of one. */
export function kindsForRole(role: Role): VerificationKind[] {
  return role === "creator" ? ["creator_kyc"] : role === "company" ? ["company_kyb", "representative"] : [];
}

export const EDITABLE: VerificationStatus[] = ["draft", "needs_info"];

const PHONE = /^\+?[0-9][0-9 -]{6,18}$/;
const HANDLE = /^@?[A-Za-z0-9._-]{1,60}$/;
const MAX_LINKS = 5;

function httpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
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
    if (f.type === "phone") {
      if (!PHONE.test(v)) return { ok: false, field: f.key };
      // Stored without spaces or dashes, so the same number always compares equal (duplicate signals).
      v = v.replace(/[ -]/g, "");
    }
    if (f.type === "country" && !COUNTRY.test(v)) return { ok: false, field: f.key };
    if (f.type === "date" && !validDate(v)) return { ok: false, field: f.key };
    if (f.type === "url" && !httpUrl(v)) return { ok: false, field: f.key };
    if (f.type === "handle" && !HANDLE.test(v)) return { ok: false, field: f.key };
    if (f.type === "select" && !f.options?.includes(v)) return { ok: false, field: f.key };
    if (f.type === "urls") {
      const lines = v.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
      if (lines.length > MAX_LINKS || !lines.every(httpUrl)) return { ok: false, field: f.key };
      v = lines.join("\n");
    }
    if (f.type === "multiselect") {
      const items = [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
      if (!items.length) {
        if (requireAll && f.required) return { ok: false, field: f.key };
        continue;
      }
      if (items.length > (f.maxItems ?? 1) || !items.every((x) => f.options?.includes(x))) return { ok: false, field: f.key };
      v = items.join(",");
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
  profile: Partial<Record<NonNullable<FieldDef["fromProfile"]>, string | null>>,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of FIELDS[kind]) {
    let fromProfile = f.fromProfile ? (profile[f.fromProfile] ?? "").toString().trim() : "";
    // A free-text value from the application only pre-fills a choice when it is one of the choices.
    if (f.type === "select") {
      fromProfile = fromProfile.toLowerCase();
      if (!f.options?.includes(fromProfile)) fromProfile = "";
    }
    if (f.type === "handle" && !HANDLE.test(fromProfile)) fromProfile = "";
    const v = saved[f.key]?.trim() || fromProfile;
    if (v) values[f.key] = v;
    else if (f.required) missing.push(f.key);
  }
  return { values, missing };
}

/** Document sets still missing before submission. */
export function missingDocuments(kind: VerificationKind, present: VerificationDocType[], { application = false }: { application?: boolean } = {}): VerificationDocType[][] {
  const sets = application ? [...DOCUMENTS[kind].requiredAnyOf, ...DOCUMENTS[kind].requiredForApplication] : DOCUMENTS[kind].requiredAnyOf;
  return sets.filter((set) => !set.some((d) => present.includes(d)));
}

/**
 * Turn a step's form into raw details: repeated keys (a multiselect's
 * checkboxes) are joined with commas. Only keys the form actually carries are
 * returned, so a step never clears another step's fields.
 */
export function formDetails(entries: Iterable<[string, FormDataEntryValue]>): Record<string, string> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of entries) if (typeof v === "string") (out[k] ??= []).push(v);
  return Object.fromEntries(Object.entries(out).map(([k, vs]) => [k, vs.filter((x) => x.trim()).join(",")]));
}

/**
 * Save one step: validate only the fields the form carries and merge them
 * into what is already saved. A carried field left empty is removed; fields
 * of other steps are kept as they were. Unknown keys are dropped.
 */
export function mergeDetails(
  kind: VerificationKind,
  saved: Record<string, string> | null,
  raw: Record<string, string>,
): { ok: true; value: Record<string, string> } | { ok: false; field: string } {
  const parsed = parseDetails(kind, raw, { requireAll: false });
  if (!parsed.ok) return parsed;
  const known = new Set(FIELDS[kind].map((f) => f.key));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(saved ?? {})) if (known.has(k) && typeof v === "string") out[k] = v;
  for (const f of FIELDS[kind]) {
    if (!(f.key in raw)) continue;
    if (parsed.value[f.key]) out[f.key] = parsed.value[f.key];
    else delete out[f.key];
  }
  return { ok: true, value: out };
}

/** Required fields of `kind` still empty in `details` (for the review step and "what is missing"). */
export function missingFields(kind: VerificationKind, details: Record<string, string> | null): string[] {
  return FIELDS[kind].filter((f) => f.required && !details?.[f.key]?.trim()).map((f) => f.key);
}

const KNOWN = new Set(["not_found", "invalid_state", "documents_missing", "email_unverified", "note_required", "not_allowed", "company_required", "invalid_input"]);
export function verificationErrorKey(message: string | null | undefined): string {
  const m = /verification:([a-z_]+)/.exec(message ?? "");
  return m && KNOWN.has(m[1]) ? `verification.errors.${m[1]}` : "ui.errors.generic";
}

/** Upload limits shared by the route and the UI. */
export const UPLOAD = { maxBytes: 5 * 1024 * 1024, mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const };
