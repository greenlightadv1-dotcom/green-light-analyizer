import type { Role, VerificationKind } from "./types/database.ts";

/**
 * Self-registration (Get Started → /register). Pure — tested in
 * registration.test.ts.
 *
 * Off unless SELF_SIGNUP_ENABLED=1. Turning it on is an owner decision: it
 * changes CLAUDE.md §3/§4 ("admin is the only role that can create accounts"),
 * Terms §2 must say so first, and Supabase Auth must have email sign-ups and
 * "Confirm email" enabled (docs/CREATOR_KYC_SPEC.md §Rollout). Until then the
 * existing application form is the only path.
 *
 * A self-registered account starts as account_status 'pending_verification'
 * and can use nothing but /verification until an admin approves it.
 */

export const REGISTER_JOURNEYS = ["creator", "company", "company_representative"] as const;
export type RegisterJourney = (typeof REGISTER_JOURNEYS)[number];

export function selfSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SELF_SIGNUP_ENABLED === "1";
}

export const JOURNEY_ROLE: Record<RegisterJourney, Role> = { creator: "creator", company: "company", company_representative: "company" };
export const JOURNEY_KIND: Record<RegisterJourney, VerificationKind> = { creator: "creator_kyc", company: "company_kyb", company_representative: "representative" };

const EMAIL = /^[^\s@<>()",;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** CLAUDE.md §16 item 5: at least 10 characters, with digits, upper- and lower-case letters and symbols. */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("length");
  if (!/[0-9]/.test(pw)) out.push("digit");
  if (!/[a-z]/.test(pw)) out.push("lower");
  if (!/[A-Z]/.test(pw)) out.push("upper");
  if (!/[^A-Za-z0-9]/.test(pw)) out.push("symbol");
  if (pw.length > 72) out.push("long");
  return out;
}

export type RegistrationInput = { journey: RegisterJourney; full_name: string; email: string; password: string };

export function parseRegistration(f: Record<string, unknown>):
  | { ok: true; value: RegistrationInput }
  | { ok: false; field: "journey" | "full_name" | "email" | "password" | "terms" } {
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  const journey = s("journey") as RegisterJourney;
  if (!REGISTER_JOURNEYS.includes(journey)) return { ok: false, field: "journey" };
  const full_name = s("full_name").trim().replace(/\s+/g, " ");
  if (full_name.length < 2 || full_name.length > 120) return { ok: false, field: "full_name" };
  const email = s("email").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, field: "email" };
  const password = s("password");
  if (passwordProblems(password).length) return { ok: false, field: "password" };
  if (s("terms") !== "on") return { ok: false, field: "terms" };
  return { ok: true, value: { journey, full_name, email, password } };
}
