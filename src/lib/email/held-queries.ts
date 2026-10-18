import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { toHeldDeliveries, type HeldDeliveries, type HeldRow } from "./held";

/**
 * Deliveries to a creator's alias that the screener held back (§5).
 *
 * Read with the service role, because `inbound_emails` is admin-only under RLS
 * and must stay so — see held.ts for why a creator policy would leak the raw
 * subject. That makes the `creatorId` argument the entire access-control
 * boundary for this function, so it has one rule:
 *
 *   **creatorId must come from the authenticated session — `requireProfile()`
 *   — and never from a parameter, a form field, a URL or anything else the
 *   caller controls.** Passing a client-supplied id here would let any
 *   creator read any other creator's held mail.
 *
 * Bounded on purpose: a window and a row cap, so this never becomes another
 * unbounded list query on a page every creator loads.
 */

export const HELD_WINDOW_DAYS = 30;
export const HELD_LIMIT = 20;

/** Exactly the columns held.ts projects from. Nothing else is fetched. */
const COLUMNS = "id, created_at, sender_email, subject, detail, spam_score, spam_reasons";

export async function listHeldDeliveries(creatorId: string): Promise<HeldDeliveries> {
  const since = new Date(Date.now() - HELD_WINDOW_DAYS * 86_400_000).toISOString();

  const { data, error } = await createAdminClient()
    .from("inbound_emails")
    .select(COLUMNS)
    .eq("creator_id", creatorId)
    .eq("status", "rejected")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    // One past the cap, so "there are more" is known without a second query.
    .limit(HELD_LIMIT + 1);

  if (error) {
    // Degrades to "nothing to show" rather than breaking the inbox: this panel
    // is reassurance, and the deal list beneath it is what the page is for.
    console.error(`held deliveries read failed: ${error.message}`);
    return { items: [], truncated: false };
  }

  const rows = (data ?? []) as HeldRow[];
  return {
    items: toHeldDeliveries(rows.slice(0, HELD_LIMIT)),
    truncated: rows.length > HELD_LIMIT,
  };
}
