"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { contentErrorKey, parseContentItem } from "@/lib/content/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Content plans (migration 0029). Private to the creator: writes run on the
 * service role, scoped to the session's own id; the database refuses a
 * collaboration the creator is not party to.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveContentItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const parsed = parseContentItem(Object.fromEntries(fd.entries()));
  if (!parsed.ok) return fail(parsed.errorKey);
  if (!(await consumeRateLimit("content_write", profile.id)).allowed) return fail("content.errors.rate_limited");
  const admin = createAdminClient();
  const id = String(fd.get("item_id") ?? "");
  const row = { ...parsed.value, updated_at: new Date().toISOString() };
  if (id) {
    if (!UUID.test(id)) return fail("ui.errors.invalid");
    const { data, error } = await admin.from("content_items").update(row).eq("id", id).eq("creator_id", profile.id).select("id");
    if (error) {
      const key = contentErrorKey(error.message);
      if (key === "ui.errors.generic") log.error("content.update_failed", { error });
      return fail(key);
    }
    if (!data?.length) return fail("content.errors.not_found");
  } else {
    const { error } = await admin.from("content_items").insert({ ...row, creator_id: profile.id });
    if (error) {
      const key = contentErrorKey(error.message);
      if (key === "ui.errors.generic") log.error("content.insert_failed", { error });
      return fail(key);
    }
  }
  revalidatePath("/content");
  return OK;
}

export async function deleteContentItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const id = String(fd.get("item_id") ?? "");
  if (!UUID.test(id)) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("content_write", profile.id)).allowed) return fail("content.errors.rate_limited");
  const { data, error } = await createAdminClient().from("content_items").delete().eq("id", id).eq("creator_id", profile.id).select("id");
  if (error) {
    log.error("content.delete_failed", { error });
    return fail("ui.errors.generic");
  }
  if (!data?.length) return fail("content.errors.not_found");
  revalidatePath("/content");
  return OK;
}
