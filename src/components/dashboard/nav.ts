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

export type NavItem = {
  href: string;
  labelKey: string;
  roles: Role[];
};

export const NAV: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", roles: ["creator", "company", "admin"] },
  // Onboarding checklist (feature 2); the page redirects an admin away.
  { href: "/onboarding", labelKey: "nav.onboarding", roles: ["creator", "company"] },
  { href: "/inbox", labelKey: "nav.inbox", roles: ["creator", "company", "admin"] },
  { href: "/discover", labelKey: "nav.discover", roles: ["company", "admin"] },
  // Collaboration lifecycle: companies write briefs, creators see invitations
  // and published briefs, both sides (and admins, read-only) track the work.
  { href: "/briefs", labelKey: "nav.briefs", roles: ["company"] },
  { href: "/shortlists", labelKey: "nav.shortlists", roles: ["company"] },
  { href: "/team", labelKey: "nav.team", roles: ["company"] },
  { href: "/opportunities", labelKey: "nav.opportunities", roles: ["creator"] },
  { href: "/collaborations", labelKey: "nav.collaborations", roles: ["creator", "company", "admin"] },
  { href: "/analyzer", labelKey: "nav.analyzer", roles: ["creator", "admin"] },
  { href: "/media-kit", labelKey: "nav.mediaKit", roles: ["creator", "admin"] },
  { href: "/portfolio", labelKey: "nav.portfolio", roles: ["creator"] },
  { href: "/content", labelKey: "nav.content", roles: ["creator"] },
  { href: "/pricing", labelKey: "nav.pricing", roles: ["creator", "company", "admin"] },
  // Creator-side, like the Media Kit: the page itself enforces the same rule
  // (requireCreatorFeatures), so this list only decides what is shown.
  { href: "/support", labelKey: "nav.support", roles: ["creator", "admin"] },
  { href: "/settings", labelKey: "nav.settings", roles: ["creator", "company", "admin"] },
  { href: "/admin/users", labelKey: "nav.adminUsers", roles: ["admin"] },
  { href: "/admin/requests", labelKey: "nav.adminRequests", roles: ["admin"] },
  { href: "/admin/verification", labelKey: "nav.adminVerification", roles: ["admin"] },
  { href: "/admin/taxonomy", labelKey: "nav.adminTaxonomy", roles: ["admin"] },
  { href: "/admin/promo-codes", labelKey: "nav.adminPromoCodes", roles: ["admin"] },
  { href: "/admin/violations", labelKey: "nav.adminViolations", roles: ["admin"] },
  { href: "/admin/relays", labelKey: "nav.adminRelays", roles: ["admin"] },
  { href: "/admin/system", labelKey: "nav.adminSystem", roles: ["admin"] },
];

/** The links a role may see, in display order. */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/** True when `pathname` is `href` or a page beneath it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
