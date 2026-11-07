/**
 * Get Started applications (features 1 and 2).
 *
 * Green Light stays admin-gated (CLAUDE.md §4, Terms §2): a visitor never
 * creates an account. "Get Started" collects one application per journey;
 * an admin reviews it and creates the account from it, reusing what the
 * applicant typed, and the forced first-login password reset follows as
 * before.
 *
 * Pure — unit-tested in access-requests.test.ts.
 */

export const JOURNEYS = ["creator", "company", "company_representative"] as const;
export type Journey = (typeof JOURNEYS)[number];

export function isJourney(v: unknown): v is Journey {
  return typeof v === "string" && (JOURNEYS as readonly string[]).includes(v);
}

/** Which account role an approved application becomes. Representatives are company accounts. */
export function roleForJourney(j: Journey): "creator" | "company" {
  return j === "creator" ? "creator" : "company";
}

export type AccessRequestInput = {
  journey: Journey;
  full_name: string;
  email: string;
  company_name: string | null;
  website: string | null;
  primary_platform: string | null;
  channel_handle: string | null;
  message: string | null;
};

export type FieldError = "required" | "invalid" | "too_long";
export type ParsedRequest =
  | { ok: true; value: AccessRequestInput }
  | { ok: false; errors: Partial<Record<keyof AccessRequestInput | "form", FieldError>> };

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
const PLATFORMS = ["youtube", "twitch", "kick", "instagram", "tiktok", "x", "other"];

function str(form: FormData | Map<string, string>, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validate an application. Required fields depend on the journey: a company
 * or a representative must name the company; a creator must name a platform.
 * Websites must be http(s). Every field has a length bound matching the
 * CHECK constraints in migration 0024.
 */
export function parseAccessRequest(form: FormData | Map<string, string>): ParsedRequest {
  const errors: Partial<Record<keyof AccessRequestInput | "form", FieldError>> = {};
  const journey = str(form, "journey");
  if (!isJourney(journey)) return { ok: false, errors: { journey: "invalid" } };

  const full_name = str(form, "full_name");
  if (!full_name) errors.full_name = "required";
  else if (full_name.length < 2) errors.full_name = "invalid";
  else if (full_name.length > 120) errors.full_name = "too_long";

  const email = str(form, "email").toLowerCase();
  if (!email) errors.email = "required";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "invalid";

  const company_name = str(form, "company_name") || null;
  if (journey !== "creator" && !company_name) errors.company_name = "required";
  else if (company_name && company_name.length > 120) errors.company_name = "too_long";

  let website = str(form, "website") || null;
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) errors.website = "invalid";
    } catch {
      errors.website = "invalid";
    }
    if (website.length > 200) errors.website = "too_long";
  }

  const primary_platform = str(form, "primary_platform") || null;
  if (journey === "creator" && !primary_platform) errors.primary_platform = "required";
  else if (primary_platform && !PLATFORMS.includes(primary_platform)) errors.primary_platform = "invalid";

  const channel_handle = str(form, "channel_handle") || null;
  if (channel_handle && channel_handle.length > 120) errors.channel_handle = "too_long";

  const message = str(form, "message") || null;
  if (message && message.length > 1000) errors.message = "too_long";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { journey, full_name, email, company_name, website, primary_platform, channel_handle, message },
  };
}

/** A form field bots fill and people never see. Non-empty means "drop it quietly". */
export const HONEYPOT_FIELD = "company_fax";
