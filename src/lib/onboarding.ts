import { knownCategories } from "./taxonomy.ts";

/**
 * Onboarding progress (feature 2), computed from the account's real data on
 * every visit rather than stored as a separate flag, so it can never drift
 * from the profile it describes, and a returning user resumes exactly where
 * the data says they are.
 *
 * Pure — unit-tested in onboarding.test.ts.
 */

export type OnboardingStepId =
  | "account"
  | "profile"
  | "photo"
  | "classification"
  | "platform"
  | "analytics"
  | "forwarding"
  | "company_details"
  | "company_logo"
  | "company_link"
  | "discover";

export type OnboardingStep = { id: OnboardingStepId; done: boolean; optional: boolean; href: string | null };
export type Onboarding = { steps: OnboardingStep[]; done: number; required: number; complete: boolean };

type ProfileLike = {
  role: "creator" | "company" | "admin";
  full_name: string | null;
  bio: string | null;
  country: string | null;
  primary_language: string | null;
  avatar_url: string | null;
  inbound_alias: string | null;
  creator_categories?: string[] | null;
  company_industry?: string | null;
};

export type OnboardingFacts = {
  kitCount: number;
  analyticsConnected: boolean;
  /** At least one deal room opened from forwarded mail (company_id null). */
  emailDealSeen: boolean;
  /** The company this account acts for, when it is a representative. */
  representsCompany: string | null;
};

function summarize(steps: OnboardingStep[]): Onboarding {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { steps, done, required: required.length, complete: done === required.length };
}

export function creatorOnboarding(p: ProfileLike, f: OnboardingFacts): Onboarding {
  return summarize([
    { id: "account", done: true, optional: false, href: null },
    { id: "profile", done: !!(p.bio?.trim() && p.country && p.primary_language), optional: false, href: "/media-kit" },
    { id: "photo", done: !!p.avatar_url, optional: false, href: null },
    { id: "classification", done: knownCategories(p.creator_categories).length > 0, optional: false, href: null },
    { id: "platform", done: f.kitCount > 0, optional: false, href: "/media-kit" },
    { id: "forwarding", done: !!p.inbound_alias && f.emailDealSeen, optional: false, href: "/settings" },
    { id: "analytics", done: f.analyticsConnected, optional: true, href: "/settings" },
  ]);
}

/**
 * Before 0024 is applied the company columns do not exist, so the details
 * step only asks for what can be stored: a description (bio).
 */
export function companyDetailsComplete(p: ProfileLike): boolean {
  const hasIndustryColumn = "company_industry" in p;
  return !!(p.full_name?.trim() && p.bio?.trim() && (!hasIndustryColumn || p.company_industry?.trim()));
}

export function companyOnboarding(p: ProfileLike, f: OnboardingFacts): Onboarding {
  const steps: OnboardingStep[] = [
    { id: "account", done: true, optional: false, href: null },
    { id: "company_details", done: companyDetailsComplete(p), optional: false, href: null },
    { id: "company_logo", done: !!p.avatar_url, optional: true, href: null },
  ];
  if (f.representsCompany) steps.push({ id: "company_link", done: true, optional: true, href: null });
  steps.push({ id: "discover", done: false, optional: true, href: "/discover" });
  return summarize(steps);
}
