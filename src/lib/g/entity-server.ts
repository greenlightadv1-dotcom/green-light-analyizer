import "server-only";

import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import type { Profile } from "@/lib/auth";
import { maskSensitiveData } from "@/lib/mask";
import type { NotificationCategory } from "@/lib/types/database";
import type { PageEntity } from "./entity";
import { buildDealRoomBrief, type DealRoomBrief, type DealRoomCollab, type DealRoomDeliverable } from "./dealroom";

/**
 * Loads the entity on the user's current page for G (Phase 1B/1C), plus their
 * outstanding notifications.
 *
 * Authorization, in two layers:
 *   1. Every read uses the caller's own Supabase client, so RLS decides which
 *      rows come back. The service role is never used here.
 *   2. RLS also lets admins read every deal and collaboration. G does not
 *      summarise other people's deals for anyone, admins included, so each
 *      entity is additionally required to name the caller as a party
 *      (creator_id or company_id = the session's id). A brief is shown to its
 *      own company, or to a creator only while it is published.
 * A row that fails either check is treated exactly like a missing one: G
 * answers that nothing is available, never "that belongs to someone else".
 *
 * Only these columns leave the database: no sender_email, no relay fields,
 * no security_check / company_profile, nothing from verification.
 */

const DEAL_COLS = "id, creator_id, company_id, deal_status, sponsorship_type, offered_amount, created_at";
const COLLAB_COLS =
  "id, deal_chat_id, company_id, creator_id, status, proposed_terms, proposed_amount_usd, proposed_by, company_confirmed_at, creator_confirmed_at, agreed_amount_usd, agreed_terms, agreed_at";
const MESSAGE_LIMIT = 30;

type CollabRow = DealRoomCollab & { deal_chat_id: string | null; company_id: string; creator_id: string };

const isParty = (row: { creator_id: string | null; company_id: string | null }, profile: Profile) =>
  row.creator_id === profile.id || row.company_id === profile.id;

export type EntityContext = {
  dealRoom: DealRoomBrief | null;
  currentBrief: {
    id: string;
    title: string;
    status: string;
    description: string | null;
    sponsorship_type: string | null;
    platforms: string[];
    categories: string[] | null;
    target_countries: string[] | null;
    deliverables_summary: string | null;
    budget_min_usd: number | null;
    budget_max_usd: number | null;
    start_date: string | null;
    due_date: string | null;
  } | null;
  /** Ids this context authorises for actions and proposals. */
  dealIds: Set<string>;
  collaborationIds: Set<string>;
};

const EMPTY: EntityContext = { dealRoom: null, currentBrief: null, dealIds: new Set(), collaborationIds: new Set() };

export async function entityContext(profile: Profile, entity: PageEntity | null): Promise<EntityContext> {
  if (!entity || (profile.role !== "creator" && profile.role !== "company")) return EMPTY;
  const side = profile.role;
  const supabase = await createClient();
  try {
    if (entity.kind === "brief") {
      const { data: b } = await supabase
        .from("briefs")
        .select("id, company_id, title, status, description, sponsorship_type, platforms, categories, target_countries, deliverables_summary, budget_min_usd, budget_max_usd, start_date, due_date")
        .eq("id", entity.id)
        .maybeSingle();
      if (!b) return EMPTY;
      const allowed = side === "company" ? b.company_id === profile.id : b.status === "published";
      if (!allowed) return EMPTY;
      return {
        ...EMPTY,
        currentBrief: {
          id: b.id,
          title: b.title,
          status: b.status,
          sponsorship_type: b.sponsorship_type,
          platforms: b.platforms,
          categories: b.categories,
          target_countries: b.target_countries,
          budget_min_usd: b.budget_min_usd,
          budget_max_usd: b.budget_max_usd,
          start_date: b.start_date,
          due_date: b.due_date,
          description: b.description ? maskSensitiveData(b.description).maskedText.slice(0, 1_500) : null,
          deliverables_summary: b.deliverables_summary ? maskSensitiveData(b.deliverables_summary).maskedText.slice(0, 800) : null,
        },
      };
    }

    let collab: CollabRow | null = null;
    let dealId: string | null = null;
    if (entity.kind === "collaboration") {
      const { data } = await supabase.from("collaborations").select(COLLAB_COLS).eq("id", entity.id).maybeSingle();
      if (!data || !isParty(data, profile)) return EMPTY;
      collab = data as CollabRow;
      dealId = collab.deal_chat_id;
    } else {
      dealId = entity.id;
    }

    const { data: deal } = dealId
      ? await supabase.from("deal_chats").select(DEAL_COLS).eq("id", dealId).maybeSingle()
      : { data: null };
    if (deal && !isParty(deal, profile)) return EMPTY;
    if (!deal && entity.kind === "deal") return EMPTY;
    if (!collab && deal) {
      const { data } = await supabase.from("collaborations").select(COLLAB_COLS).eq("deal_chat_id", deal.id).maybeSingle();
      if (data && isParty(data, profile)) collab = data as CollabRow;
    }
    if (!deal) {
      // A collaboration without a room (should not happen after 0026): terms
      // and deliverables only.
      if (!collab) return EMPTY;
    }

    const [{ data: msgs }, { data: dels }] = await Promise.all([
      deal
        ? supabase.from("messages").select("sender_id, message_text, created_at").eq("chat_id", deal.id).order("created_at", { ascending: false }).limit(MESSAGE_LIMIT)
        : Promise.resolve({ data: [] }),
      collab
        ? supabase.from("deliverables").select("title, status, due_date, submitted_at, reviewed_at, revision_count").eq("collaboration_id", collab.id).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const dealRow = deal ?? {
      id: collab!.deal_chat_id ?? collab!.id,
      creator_id: collab!.creator_id,
      company_id: collab!.company_id,
      deal_status: "negotiating" as const,
      sponsorship_type: null,
      offered_amount: null,
      created_at: new Date(0).toISOString(),
    };
    const brief = buildDealRoomBrief({
      viewerId: profile.id,
      viewerSide: side,
      deal: { ...dealRow, deal_status: dealRow.deal_status ?? "new", created_at: dealRow.created_at ?? new Date(0).toISOString() },
      collaboration: collab,
      deliverables: (dels ?? []) as DealRoomDeliverable[],
      messages: (msgs ?? []).map((m) => ({ ...m, created_at: m.created_at ?? new Date(0).toISOString() })),
    });
    return {
      ...EMPTY,
      dealRoom: brief,
      dealIds: new Set(deal ? [deal.id] : []),
      collaborationIds: new Set(collab ? [collab.id] : []),
    };
  } catch (error) {
    log.warn("g.entity_read_failed", { kind: entity.kind, error });
    return EMPTY;
  }
}

export type TasksContext = { unread: number; byCategory: Partial<Record<NotificationCategory, number>> };

/** The caller's own unread notifications, counted by category (RLS: recipient only). */
export async function tasksContext(profile: Profile): Promise<TasksContext> {
  if (profile.role !== "creator" && profile.role !== "company") return { unread: 0, byCategory: {} };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("category")
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .limit(200);
  if (error) return { unread: 0, byCategory: {} };
  const byCategory: TasksContext["byCategory"] = {};
  for (const n of data ?? []) {
    const c = n.category as NotificationCategory;
    byCategory[c] = (byCategory[c] ?? 0) + 1;
  }
  return { unread: (data ?? []).length, byCategory };
}
