"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { cleanText } from "@/lib/collab/text";
import { p3ErrorKey, parsePortfolioItem, parseVisibility, reorder, VISIBILITY_FIELDS } from "@/lib/portfolio/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Creator portfolio and public-profile visibility (migration 0028). Writes
 * run on the service role, scoped to the session's own creator id. Portfolio
 * text can be shown publicly, so it goes through the same contact-detail mask
 * as chat (violations are logged), and a brand is named publicly only when
 * the creator ticks the consent box.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/portfolio");
  revalidatePath("/p/[slug]", "page");
}

export async function savePortfolioItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const parsed = parsePortfolioItem(Object.fromEntries(fd.entries()));
  if (!parsed.ok) return fail(parsed.errorKey);
  if (!(await consumeRateLimit("portfolio_write", profile.id)).allowed) return fail("portfolio.errors.rate_limited");
  const v = parsed.value;
  const row = {
    ...v,
    title: (await cleanText(profile.id, v.title)) ?? v.title,
    description: await cleanText(profile.id, v.description),
    brand_name: await cleanText(profile.id, v.brand_name),
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const itemId = String(fd.get("item_id") ?? "");
  if (itemId) {
    if (!UUID.test(itemId)) return fail("ui.errors.invalid");
    const { data, error } = await admin.from("portfolio_items").update(row).eq("id", itemId).eq("creator_id", profile.id).select("id");
    if (error) {
      log.error("portfolio.update_failed", { error });
      return fail("ui.errors.generic");
    }
    if (!data?.length) return fail("portfolio.errors.not_found");
  } else {
    const { data: last } = await admin
      .from("portfolio_items")
      .select("sort_order")
      .eq("creator_id", profile.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await admin.from("portfolio_items").insert({ ...row, creator_id: profile.id, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) {
      const key = p3ErrorKey(error.message);
      if (key === "ui.errors.generic") log.error("portfolio.insert_failed", { error });
      return fail(key);
    }
  }
  refresh();
  return OK;
}

export async function deletePortfolioItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const id = String(fd.get("item_id") ?? "");
  if (!UUID.test(id)) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("portfolio_write", profile.id)).allowed) return fail("portfolio.errors.rate_limited");
  const { data, error } = await createAdminClient().from("portfolio_items").delete().eq("id", id).eq("creator_id", profile.id).select("id");
  if (error) {
    log.error("portfolio.delete_failed", { error });
    return fail("ui.errors.generic");
  }
  if (!data?.length) return fail("portfolio.errors.not_found");
  refresh();
  return OK;
}

/** Move one item up or down; rewrites the creator's own sort order only. */
export async function movePortfolioItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const id = String(fd.get("item_id") ?? "");
  const dir = fd.get("dir") === "up" ? "up" : "down";
  if (!UUID.test(id)) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("portfolio_write", profile.id)).allowed) return fail("portfolio.errors.rate_limited");
  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("portfolio_items")
    .select("id")
    .eq("creator_id", profile.id)
    .order("sort_order")
    .order("created_at");
  if (error || !items) {
    log.error("portfolio.move_read_failed", { error });
    return fail("ui.errors.generic");
  }
  const before = items.map((i) => i.id);
  const after = reorder(before, id, dir);
  for (let n = 0; n < after.length; n++) {
    const { error: e } = await admin.from("portfolio_items").update({ sort_order: n + 1 }).eq("id", after[n]).eq("creator_id", profile.id);
    if (e) {
      log.error("portfolio.move_failed", { error: e });
      return fail("ui.errors.generic");
    }
  }
  refresh();
  return OK;
}

export async function savePublicVisibility(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  if (!(await consumeRateLimit("portfolio_write", profile.id)).allowed) return fail("portfolio.errors.rate_limited");
  const on = new Set(fd.getAll("show").map(String));
  const settings = parseVisibility((k) => on.has(k) && (VISIBILITY_FIELDS as readonly string[]).includes(k));
  const { error } = await createAdminClient()
    .from("public_profile_settings")
    .upsert({ profile_id: profile.id, ...settings, updated_at: new Date().toISOString() });
  if (error) {
    log.error("portfolio.visibility_failed", { error });
    return fail("ui.errors.generic");
  }
  refresh();
  return OK;
}
