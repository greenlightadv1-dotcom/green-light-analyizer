/**
 * Company representative scopes (migration 0034,
 * docs/COMPANY_REPRESENTATIVES_PERMISSIONS.md).
 *
 * Least privilege: a representative linked to a company can do nothing for it
 * until the company grants a scope. Only scopes the product enforces can be
 * granted. Scopes with financial or contractual effect are refused until the
 * owner decides; the rest are not built yet. The database is the authority
 * (company_set_scope, member_has_scope); this list drives the UI and the
 * server checks.
 *
 * Pure — tested in company-access.test.ts.
 */
export const SCOPES = [
  { id: "company.view", status: "available" },
  { id: "company.edit", status: "available" },
  { id: "discovery.view", status: "available" },
  { id: "briefs.view", status: "available" },
  { id: "briefs.create", status: "not_built" },
  { id: "invitations.prepare", status: "not_built" },
  { id: "invitations.send", status: "approval_required" },
  { id: "collaborations.access", status: "not_built" },
  { id: "deals.view", status: "not_built" },
  { id: "deals.financial", status: "approval_required" },
  { id: "members.manage", status: "approval_required" },
] as const;

export type ScopeId = (typeof SCOPES)[number]["id"];
export type ScopeStatus = (typeof SCOPES)[number]["status"];

export function isScopeId(v: unknown): v is ScopeId {
  return typeof v === "string" && SCOPES.some((s) => s.id === v);
}

export function grantable(scope: ScopeId): boolean {
  return SCOPES.find((s) => s.id === scope)?.status === "available";
}

const CODES = new Set(["not_allowed", "not_found", "approval_required", "not_available"]);
export function permissionErrorKey(message: string | null | undefined): string {
  const m = /perm:([a-z_]+)/.exec(message ?? "");
  return m && CODES.has(m[1]) ? `team.errors.${m[1]}` : "ui.errors.generic";
}
