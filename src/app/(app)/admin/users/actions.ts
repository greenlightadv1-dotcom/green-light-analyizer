"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInboundAlias } from "@/lib/alias";
import { requireRole } from "@/lib/auth";
import type { Region, Role } from "@/lib/types/database";

export type CreateUserState = {
  error: string | null;
  /** Shown once, immediately after creation. Never stored, never re-shown. */
  created: { email: string; tempPassword: string } | null;
};

const ROLES: Role[] = ["creator", "company", "admin"];
const REGIONS: Region[] = ["MENA", "International"];

function temporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Admin-only account creation — CLAUDE.md §4.1.
 *
 * This is the ONLY way an account comes into existence. There is no public
 * registration form anywhere in the product, and this action re-checks the
 * caller's role server-side rather than trusting that the page was only
 * reachable by an admin.
 */
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireRole("admin");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const region = String(formData.get("region") ?? "MENA") as Region;

  if (!email || !fullName) {
    return { error: "Name and email are required.", created: null };
  }
  if (!ROLES.includes(role)) {
    return { error: "Pick a valid role.", created: null };
  }
  if (!REGIONS.includes(region)) {
    return { error: "Pick a valid region.", created: null };
  }

  const admin = createAdminClient();
  const tempPassword = temporaryPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    // Admin-vetted account: no confirmation email, the admin hands over the
    // temporary password out of band.
    email_confirm: true,
    // Authoritative forced-reset gate (§4.2). app_metadata is service-role
    // writable only, so the user cannot clear it to skip the reset.
    app_metadata: { must_change_password: true },
  });

  if (error || !data.user) {
    return {
      error: error?.message ?? "Could not create that account.",
      created: null,
    };
  }

  // Only creators get an inbound alias — companies never receive offer mail.
  const inboundAlias =
    role === "creator" ? generateInboundAlias(fullName) : null;

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    role,
    region,
    subscription_plan: "Starter",
    inbound_alias: inboundAlias,
    primary_email: email,
    must_change_password: true,
  });

  if (profileError) {
    // Don't leave a half-created account that can log in but has no profile.
    await admin.auth.admin.deleteUser(data.user.id);
    return {
      error: `Account rolled back — profile could not be created: ${profileError.message}`,
      created: null,
    };
  }

  revalidatePath("/admin/users");
  return { error: null, created: { email, tempPassword } };
}
