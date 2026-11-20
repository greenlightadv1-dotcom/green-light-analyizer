"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { PORTFOLIO_LIMITS, p3ErrorKey, parseShortlistName } from "@/lib/portfolio/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Company shortlists (migration 0028). Private to the company: signed-in
 * users can only read their own, so writes run on the service role and every
 * statement is scoped to the session's own company id. The database also
 * refuses a non-company owner, a non-creator entry and the list limits.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, name: string) => {
  const v = String(fd.get(name) ?? "");
  return UUID.test(v) ? v : null;
};

function refresh() {
  revalidatePath("/shortlists");
  revalidatePath("/discover");
}

/** True when the list exists and belongs to this company. */
async function ownsList(companyId: string, shortlistId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("shortlists")
    .select("id")
    .eq("id", shortlistId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !!data;
}

export async function createShortlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const name = parseShortlistName(fd.get("name"));
  if (!name) return fail("shortlists.errors.name");
  if (!(await consumeRateLimit("shortlist_write", profile.id)).allowed) return fail("shortlists.errors.rate_limited");
  const { error } = await createAdminClient().from("shortlists").insert({ company_id: profile.id, name });
  if (error) {
    const key = p3ErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("shortlist.create_failed", { error });
    return fail(key);
  }
  refresh();
  return OK;
}

export async function renameShortlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const id = uuid(fd, "shortlist_id");
  const name = parseShortlistName(fd.get("name"));
  if (!id) return fail("ui.errors.invalid");
  if (!name) return fail("shortlists.errors.name");
  if (!(await consumeRateLimit("shortlist_write", profile.id)).allowed) return fail("shortlists.errors.rate_limited");
  const { data, error } = await createAdminClient()
    .from("shortlists")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", profile.id)
    .select("id");
  if (error) {
    const key = p3ErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("shortlist.rename_failed", { error });
    return fail(key);
  }
  if (!data?.length) return fail("shortlists.errors.not_found");
  refresh();
  return OK;
}

export async function deleteShortlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const id = uuid(fd, "shortlist_id");
  if (!id) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("shortlist_write", profile.id)).allowed) return fail("shortlists.errors.rate_limited");
  const { data, error } = await createAdminClient().from("shortlists").delete().eq("id", id).eq("company_id", profile.id).select("id");
  if (error) {
    log.error("shortlist.delete_failed", { error });
    return fail("ui.errors.generic");
  }
  if (!data?.length) return fail("shortlists.errors.not_found");
  refresh();
  return OK;
}

export async function addToShortlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const listId = uuid(fd, "shortlist_id");
  const creatorId = uuid(fd, "creator_id");
  if (!listId || !creatorId) return fail("shortlists.errors.pick_list");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length > PORTFOLIO_LIMITS.note) return fail("shortlists.errors.note");
  if (!(await consumeRateLimit("shortlist_write", profile.id)).allowed) return fail("shortlists.errors.rate_limited");
  if (!(await ownsList(profile.id, listId))) return fail("shortlists.errors.not_found");
  const { error } = await createAdminClient()
    .from("shortlist_entries")
    .insert({ shortlist_id: listId, creator_id: creatorId, note: note || null });
  if (error) {
    const key = p3ErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("shortlist.add_failed", { error });
    return fail(key);
  }
  refresh();
  return OK;
}

export async function removeFromShortlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const listId = uuid(fd, "shortlist_id");
  const creatorId = uuid(fd, "creator_id");
  if (!listId || !creatorId) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("shortlist_write", profile.id)).allowed) return fail("shortlists.errors.rate_limited");
  if (!(await ownsList(profile.id, listId))) return fail("shortlists.errors.not_found");
  const { error } = await createAdminClient().from("shortlist_entries").delete().eq("shortlist_id", listId).eq("creator_id", creatorId);
  if (error) {
    log.error("shortlist.remove_failed", { error });
    return fail("ui.errors.generic");
  }
  refresh();
  return OK;
}
