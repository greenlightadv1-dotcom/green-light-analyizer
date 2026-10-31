"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject a pending application. Admin-only; nothing is sent to the applicant. */
export async function rejectRequest(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const id = String(formData.get("request_id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await createAdminClient()
    .from("access_requests")
    .update({ status: "rejected", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) log.error("access_request.reject_failed", { code: error.code });
  revalidatePath("/admin/requests");
}

export type LinkState = { error: string | null; linked: boolean };

/**
 * Link a representative account to the company it acts for (feature 2).
 * Both accounts must already exist as role "company" and be different; a
 * representative belongs to one company (member_id is the primary key). The
 * link only lets the representative see who they represent — it grants no
 * access to the company's deals.
 */
export async function linkRepresentative(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const admin = await requireRole("admin");
  const memberEmail = String(formData.get("member_email") ?? "").trim().toLowerCase();
  const companyEmail = String(formData.get("company_email") ?? "").trim().toLowerCase();
  if (!memberEmail || !companyEmail || memberEmail === companyEmail) {
    return { error: "Enter two different account emails.", linked: false };
  }
  const service = createAdminClient();
  const { data: rows } = await service
    .from("profiles")
    .select("id, role, primary_email")
    .in("primary_email", [memberEmail, companyEmail]);
  const member = rows?.find((r) => r.primary_email.toLowerCase() === memberEmail);
  const company = rows?.find((r) => r.primary_email.toLowerCase() === companyEmail);
  if (!member || !company) return { error: "Both accounts must already exist.", linked: false };
  if (member.role !== "company" || company.role !== "company") {
    return { error: "Both accounts must be company accounts.", linked: false };
  }
  const { error } = await service.from("company_members").insert({
    member_id: member.id,
    company_id: company.id,
    member_role: "representative",
    created_by: admin.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That account is already linked to a company.", linked: false };
    log.error("company_members.link_failed", { code: error.code });
    return { error: error.code === "42P01" ? "Migration 0024 is not applied yet." : "Could not link those accounts.", linked: false };
  }
  revalidatePath("/admin/requests");
  return { error: null, linked: true };
}

/** Remove a representative link. */
export async function unlinkRepresentative(formData: FormData): Promise<void> {
  await requireRole("admin");
  const memberId = String(formData.get("member_id") ?? "");
  if (!UUID.test(memberId)) return;
  await createAdminClient().from("company_members").delete().eq("member_id", memberId);
  revalidatePath("/admin/requests");
}
