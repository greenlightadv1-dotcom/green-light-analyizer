import type { Role } from "../types/database.ts";

/**
 * What G may suggest the user do next. Navigation only: every entry opens a
 * page where the user acts with the product's own forms and buttons. G never
 * sends, accepts, publishes, connects or pays anything itself, so there is no
 * consequential action here to confirm; the confirmation is the user pressing
 * the real button on the page G opened.
 *
 * Two actions take a parameter (a creator id, a deal id). The server accepts a
 * parameter only if it appears in that user's own authorized context, so a
 * model or a tampered request cannot point G at someone else's deal.
 *
 * Pure.
 */
export type GActionId =
  | "open_dashboard"
  | "open_onboarding"
  | "open_media_kit"
  | "open_connections"
  | "open_analyzer"
  | "open_inbox"
  | "open_deal"
  | "open_discover"
  | "open_creator"
  | "open_pricing"
  | "open_support"
  | "open_settings"
  | "open_briefs"
  | "open_brief"
  | "open_opportunities"
  | "open_collaborations"
  | "open_collaboration"
  | "open_shortlists"
  | "open_portfolio"
  | "open_content"
  | "open_notifications";

type ActionDef = { href: string; roles: readonly Role[]; param?: "deal" | "creator" | "brief" | "collaboration" };

export const G_ACTIONS: Record<GActionId, ActionDef> = {
  open_dashboard: { href: "/dashboard", roles: ["creator", "company", "admin"] },
  open_onboarding: { href: "/onboarding", roles: ["creator", "company"] },
  open_media_kit: { href: "/media-kit", roles: ["creator", "admin"] },
  open_connections: { href: "/settings", roles: ["creator"] },
  open_analyzer: { href: "/analyzer", roles: ["creator", "admin"] },
  open_inbox: { href: "/inbox", roles: ["creator", "company", "admin"] },
  open_deal: { href: "/inbox/", roles: ["creator", "company"], param: "deal" },
  open_discover: { href: "/discover", roles: ["company", "admin"] },
  open_creator: { href: "/discover?creator=", roles: ["company", "admin"], param: "creator" },
  open_pricing: { href: "/pricing", roles: ["creator", "company", "admin"] },
  open_support: { href: "/support", roles: ["creator", "admin"] },
  open_settings: { href: "/settings", roles: ["creator", "company", "admin"] },
  open_briefs: { href: "/briefs", roles: ["company"] },
  open_brief: { href: "/briefs/", roles: ["company"], param: "brief" },
  open_opportunities: { href: "/opportunities", roles: ["creator"] },
  open_collaborations: { href: "/collaborations", roles: ["creator", "company", "admin"] },
  open_collaboration: { href: "/collaborations/", roles: ["creator", "company"], param: "collaboration" },
  open_shortlists: { href: "/shortlists", roles: ["company"] },
  open_portfolio: { href: "/portfolio", roles: ["creator"] },
  open_content: { href: "/content", roles: ["creator"] },
  open_notifications: { href: "/notifications", roles: ["creator", "company"] },
};

export type GAction = { action: GActionId; param?: string };

export type ActionScope = {
  role: Role;
  /** Deal ids the user is a party to (from their own RLS-scoped read). */
  dealIds: ReadonlySet<string>;
  /** Creator ids from the authorized Discovery directory. */
  creatorIds: ReadonlySet<string>;
  /** The company's own brief ids (RLS-scoped read). */
  briefIds?: ReadonlySet<string>;
  /** Collaboration ids the user is a party to (RLS-scoped read). */
  collaborationIds?: ReadonlySet<string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keep only actions this user may take, with parameters drawn from their own
 * context. Anything else — an unknown id, another role's page, a deal or
 * creator id the user cannot see — is dropped silently. At most 4 survive.
 */
export function allowedActions(candidates: unknown, scope: ActionScope): GAction[] {
  if (!Array.isArray(candidates)) return [];
  const out: GAction[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const { action, param } = c as Record<string, unknown>;
    if (typeof action !== "string" || !(action in G_ACTIONS)) continue;
    const def = G_ACTIONS[action as GActionId];
    if (!def.roles.includes(scope.role)) continue;
    let p: string | undefined;
    if (def.param) {
      if (typeof param !== "string" || !UUID.test(param)) continue;
      const allowed =
        def.param === "deal" ? scope.dealIds
        : def.param === "creator" ? scope.creatorIds
        : def.param === "brief" ? scope.briefIds ?? new Set<string>()
        : scope.collaborationIds ?? new Set<string>();
      if (!allowed.has(param)) continue;
      p = param;
    }
    const key = `${action}:${p ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p ? { action: action as GActionId, param: p } : { action: action as GActionId });
    if (out.length === 4) break;
  }
  return out;
}

/** The URL an allowed action opens. */
export function actionHref(a: GAction): string {
  const def = G_ACTIONS[a.action];
  return def.param && a.param ? `${def.href}${encodeURIComponent(a.param)}` : def.href;
}
