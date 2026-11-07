"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { parseTermInput, taxonomyErrorMessage } from "@/lib/taxonomy-admin";

/**
 * Admin-managed taxonomy (0033). Admin role checked on the server for every
 * action; writes go through the service role after validation, and the
 * database re-checks parent kinds, cycles and the frozen kind. A referenced
 * term cannot be deleted (taxonomy_delete), only deactivated.
 */
export type TermState = { ok: boolean; message: string | null };

const refresh = () => {
  revalidatePath("/admin/taxonomy");
  revalidatePath("/onboarding");
  revalidatePath("/discover");
  revalidatePath("/media-kit");
};

export async function saveTerm(_prev: TermState | null, fd: FormData): Promise<TermState> {
  const admin = await requireRole("admin");
  const parsed = parseTermInput(Object.fromEntries(fd.entries()));
  if (!parsed.ok) return { ok: false, message: `Check the field "${parsed.field.replace(/_/g, " ")}".` };
  const mode = fd.get("mode") === "create" ? "create" : "update";
  const service = createAdminClient();
  const row = { ...parsed.value, updated_by: admin.id };
  const { error } =
    mode === "create"
      ? await service.from("taxonomy_terms").insert(row)
      : await service.from("taxonomy_terms").update(row).eq("id", parsed.value.id);
  if (error) {
    if (error.code === "23505") return { ok: false, message: "A term with that id already exists." };
    log.warn("taxonomy.save_refused", { code: error.code, message: error.message });
    return { ok: false, message: taxonomyErrorMessage(error.message) };
  }
  refresh();
  return { ok: true, message: mode === "create" ? "Term added." : "Term saved." };
}

export async function deleteTerm(_prev: TermState | null, fd: FormData): Promise<TermState> {
  await requireRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!/^[a-z0-9_]{2,40}$/.test(id)) return { ok: false, message: "Invalid term." };
  const { error } = await createAdminClient().rpc("taxonomy_delete", { p_id: id });
  if (error) return { ok: false, message: taxonomyErrorMessage(error.message) };
  refresh();
  return { ok: true, message: "Term deleted." };
}
