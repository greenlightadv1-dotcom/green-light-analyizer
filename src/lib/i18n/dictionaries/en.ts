/**
 * English is the structural source of truth: every other dictionary must
 * carry exactly these keys (checked by dictionaries/index.ts in dev).
 *
 * Scope, deliberately: shared chrome (Sidebar/TopBar) and the public landing
 * page — the two surfaces that reach literally every screen or every
 * visitor, same reasoning as the theming rollout. Page-level content
 * (dashboard cards, deal data, admin tables, form copy) stays English for
 * this pass; translating that is a much larger follow-up, not attempted
 * here.
 */
const en = {
  nav: {
    dashboard: "Dashboard",
    inbox: "Deal inbox",
    discover: "Discover creators",
    analyzer: "Manual analyzer",
    mediaKit: "Media kit",
    settings: "Settings",
    adminUsers: "Accounts",
    adminPromoCodes: "Promo codes",
    adminViolations: "Violations",
    adminSystem: "System",
  },
  topbar: {
    signOut: "Sign out",
  },
  theme: {
    changeTheme: "Change theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  language: {
    changeLanguage: "Change language",
    label: "Language",
  },
  landing: {
    badge: "Admin-gated sponsorship marketplace",
    headline: "Your Personal Business Manager",
    subheadline:
      "Verified creator stats, masked negotiations, and an AI co-pilot that prices every offer — no screenshots, no leaked contact info, no deal that skips the platform.",
    ctaRequestAccess: "Request access",
    ctaSignIn: "Sign in",
    noSignupNote: "Accounts are created by an admin — no public sign-up.",
    valueProp1Title: "No screenshot fraud",
    valueProp1Body:
      "Creator stats sync from official platform APIs — YouTube, Twitch and Instagram — never a self-reported screenshot. Anything unverified is labelled as such, everywhere it's shown.",
    valueProp2Title: "Commission stays protected",
    valueProp2Body:
      "A creator's real email and phone never reach a company. Every message runs through the masked in-app chat, so a deal can't quietly move off-platform.",
    valueProp3Title: "AI Deal Co-Pilot",
    valueProp3Body:
      "Every inbound offer gets an instant price recommendation and a green / yellow / red risk rating, weighted by how much of the audience data behind it is actually verified.",
    footerRights: "All rights reserved.",
    joinDiscord: "Join our Discord",
  },
};

export default en;
export type Dictionary = typeof en;
