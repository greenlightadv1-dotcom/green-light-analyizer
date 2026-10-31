import type { Role } from "@/lib/types/database";

/**
 * Who may use the creator-side tools: the Media Kit, its sync and niche
 * actions, the creator profile, and the verified-geography OAuth flow.
 *
 * Until the unified Creator Plan, the only thing standing between a company
 * account and those tools was its plan: every company is stored as Starter,
 * and Starter was refused verified geography and capped at two media kits.
 * With the plan no longer deciding access, the role has to, explicitly and on
 * the server. Admins keep the access the navigation already gives them
 * (components/dashboard/nav.ts lists /media-kit for creator and admin).
 *
 * Pure, so the boundary is unit-tested directly (access.test.ts).
 */
export const CREATOR_FEATURE_ROLES: readonly Role[] = ["creator", "admin"];

export function canUseCreatorFeatures(role: Role | null | undefined): boolean {
  return !!role && CREATOR_FEATURE_ROLES.includes(role);
}

/** The refusal a server action returns to a role that may not use it. */
export const CREATOR_ONLY_ERROR = "This is only available to creator accounts.";
