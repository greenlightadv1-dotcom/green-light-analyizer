"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { refreshNews } from "@/lib/news/refresh";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/** Fetch the allow-listed official feeds once, now. Admin only; notifies nobody. */
export async function refreshNewsNow(_prev: ActionResult | null): Promise<ActionResult> {
  await requireRole("admin");
  const results = await refreshNews();
  revalidatePath("/admin/news");
  revalidatePath("/content");
  return results.some((r) => r.error === null) ? OK : fail("adminNews.allFailed");
}
