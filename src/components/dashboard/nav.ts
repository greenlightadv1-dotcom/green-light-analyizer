import type { Role } from "@/lib/types/database";

/**
 * The app's navigation, defined once. Both the desktop Sidebar and the mobile
 * drawer render from navItemsForRole(), so a link or a role rule can never be
 * added to one and forgotten in the other.
 *
 * This is navigation only, not access control: every page and server action
 * re-checks the caller's role server-side (requireRole / requireProfile).
 *
 * Pure — no React, no "use client" — so it is unit-tested directly
 * (nav.test.ts).
 */

/**
 * Sections are headings over a flat list, not nested menus: every link is
 * always one click away. `work` is labelled per role (Deals / Campaigns /
 * Marketplace); the others share one label.
 */
export type NavSection = "overview" | "work" | "profile" | "admin" | "account";
export const NAV_SECTIONS: readonly NavSection[] = ["overview", "work", "profile", "admin", "account"];

export type NavItem = {
  href: string;
  labelKey: string;
  roles: Role[];
  section: NavSection;
  /** Where an admin sees this link, when it differs (admins have no profile). */
  adminSection?: NavSection;
};

export const NAV: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", roles: ["creator", "company", "admin"], section: "overview" },
  // Onboarding checklist (feature 2); the page redirects an admin away.
  { href: "/onboarding", labelKey: "nav.onboarding", roles: ["creator", "company"], section: "overview" },
  { href: "/inbox", labelKey: "nav.inbox", roles: ["creator", "company", "admin"], section: "work" },
  { href: "/discover", labelKey: "nav.discover", roles: ["company", "admin"], section: "work" },
  // Collaboration lifecycle: companies write briefs, creators see invitations
  // and published briefs, both sides (and admins, read-only) track the work.
  { href: "/opportunities", labelKey: "nav.opportunities", roles: ["creator"], section: "work" },
  { href: "/briefs", labelKey: "nav.briefs", roles: ["company"], section: "work" },
  { href: "/shortlists", labelKey: "nav.shortlists", roles: ["company"], section: "work" },
  { href: "/collaborations", labelKey: "nav.collaborations", roles: ["creator", "company", "admin"], section: "work" },
  { href: "/analyzer", labelKey: "nav.analyzer", roles: ["creator", "admin"], section: "work" },
  { href: "/media-kit", labelKey: "nav.mediaKit", roles: ["creator", "admin"], section: "profile", adminSection: "work" },
  { href: "/portfolio", labelKey: "nav.portfolio", roles: ["creator"], section: "profile" },
  { href: "/content", labelKey: "nav.content", roles: ["creator"], section: "profile" },
  { href: "/admin/users", labelKey: "nav.adminUsers", roles: ["admin"], section: "admin" },
  { href: "/admin/requests", labelKey: "nav.adminRequests", roles: ["admin"], section: "admin" },
  { href: "/admin/verification", labelKey: "nav.adminVerification", roles: ["admin"], section: "admin" },
  { href: "/admin/violations", labelKey: "nav.adminViolations", roles: ["admin"], section: "admin" },
  { href: "/admin/relays", labelKey: "nav.adminRelays", roles: ["admin"], section: "admin" },
  { href: "/admin/taxonomy", labelKey: "nav.adminTaxonomy", roles: ["admin"], section: "admin" },
  { href: "/admin/news", labelKey: "nav.adminNews", roles: ["admin"], section: "admin" },
  { href: "/admin/promo-codes", labelKey: "nav.adminPromoCodes", roles: ["admin"], section: "admin" },
  { href: "/admin/system", labelKey: "nav.adminSystem", roles: ["admin"], section: "admin" },
  { href: "/team", labelKey: "nav.team", roles: ["company"], section: "account" },
  { href: "/pricing", labelKey: "nav.pricing", roles: ["creator", "company", "admin"], section: "account" },
  // Creator-side, like the Media Kit: the page itself enforces the same rule
  // (requireCreatorFeatures), so this list only decides what is shown.
  { href: "/support", labelKey: "nav.support", roles: ["creator", "admin"], section: "account" },
  { href: "/settings", labelKey: "nav.settings", roles: ["creator", "company", "admin"], section: "account" },
];

/** Dictionary key for a section heading; `overview` has none (it is the top). */
export function sectionLabelKey(section: NavSection, role: Role): string | null {
  if (section === "overview") return null;
  if (section === "work") return role === "creator" ? "nav.sectionDeals" : role === "company" ? "nav.sectionCampaigns" : "nav.sectionMarketplace";
  return section === "profile" ? "nav.sectionProfile" : section === "admin" ? "nav.sectionAdmin" : "nav.sectionAccount";
}

/** A role's links grouped by section, in display order, empty sections dropped. */
export function navSectionsForRole(role: Role): { section: NavSection; items: NavItem[] }[] {
  const items = navItemsForRole(role);
  const sectionOf = (i: NavItem) => (role === "admin" && i.adminSection ? i.adminSection : i.section);
  return NAV_SECTIONS.map((section) => ({ section, items: items.filter((i) => sectionOf(i) === section) })).filter((g) => g.items.length);
}

/**
 * The phone tab bar: the three destinations each role uses most, plus G and
 * "More" (the full list in the drawer). Every entry is also in NAV, so the
 * bar can never show a link the role may not see.
 */
export const MOBILE_TABS: Record<Role, readonly { href: string; labelKey: string }[]> = {
  creator: [
    { href: "/dashboard", labelKey: "nav.tabHome" },
    { href: "/inbox", labelKey: "nav.tabInbox" },
    { href: "/collaborations", labelKey: "nav.tabCollabs" },
  ],
  company: [
    { href: "/dashboard", labelKey: "nav.tabHome" },
    { href: "/discover", labelKey: "nav.tabDiscover" },
    { href: "/briefs", labelKey: "nav.tabBriefs" },
  ],
  admin: [
    { href: "/dashboard", labelKey: "nav.tabHome" },
    { href: "/admin/users", labelKey: "nav.tabAccounts" },
    { href: "/admin/verification", labelKey: "nav.tabVerify" },
  ],
};

/** The links a role may see, in display order. */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/** True when `pathname` is `href` or a page beneath it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
