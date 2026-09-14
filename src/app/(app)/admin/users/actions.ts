"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInboundAlias } from "@/lib/alias";
import { extendExpiry } from "@/lib/subscription";
import { requireRole } from "@/lib/auth";
import type {
  AdminActionType,
  Database,
  Region,
  Role,
  SubscriptionPlan,
} from "@/lib/types/database";

export type CreateUserState = {
  error: string | null;
  /** Shown once, immediately after creation. Never stored, never re-shown. */
  created: { email: string; tempPassword: string } | null;
};

const ROLES: Role[] = ["creator", "company", "admin"];
const REGIONS: Region[] = ["MENA", "International"];
const PLANS: SubscriptionPlan[] = ["Starter", "Pro", "Elite"];
/** Monthly / Quarterly / Yearly, per the admin renewal UI. "custom"/"none" are handled separately. */
const DURATION_PRESETS = [30, 90, 365];

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

/**
 * Edit an existing account's plan, region or role, and/or renew its
 * subscription for a chosen duration.
 *
 * Reads the current row first so admin_actions gets an exact old -> new diff
 * and so a role change can tell whether it's actually moving into or out of
 * 'creator' -- inbound_alias generation depends on that, not just the new
 * value in isolation.
 *
 * Void return, same as the violation-queue actions below: this is a plain
 * <select> form with no free text, so there is nothing a user could submit
 * that the browser's own required/option constraints don't already rule out.
 */
export async function updateProfile(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const targetId = String(formData.get("profile_id") ?? "");
  // Own row never renders a Manage control, so reaching this is only possible
  // via a hand-crafted request -- silently refuse rather than let an admin
  // lock themselves out of their own account.
  if (!targetId || targetId === admin.id) return;

  const plan = String(formData.get("subscription_plan") ?? "") as SubscriptionPlan;
  const region = String(formData.get("region") ?? "") as Region;
  const role = String(formData.get("role") ?? "") as Role;
  if (!PLANS.includes(plan) || !REGIONS.includes(region) || !ROLES.includes(role)) {
    return;
  }

  // Duration is opt-in: "none" (the form's default) means don't touch
  // subscription_expires_at at all, so saving an unrelated region/role edit
  // can never accidentally renew someone's subscription as a side effect.
  const durationPreset = String(formData.get("duration_preset") ?? "none");
  let explicitDurationDays: number | null = null;
  if (durationPreset === "custom") {
    const customDays = Number(formData.get("custom_days"));
    if (Number.isFinite(customDays) && customDays > 0) {
      explicitDurationDays = Math.floor(customDays);
    }
  } else {
    const preset = Number(durationPreset);
    if (DURATION_PRESETS.includes(preset)) explicitDurationDays = preset;
  }

  const service = createAdminClient();

  const { data: current } = await service
    .from("profiles")
    .select("subscription_plan, subscription_expires_at, region, role, inbound_alias, full_name")
    .eq("id", targetId)
    .single();
  if (!current) return;

  const updates: Database["public"]["Tables"]["profiles"]["Update"] = {};
  const auditRows: {
    action: AdminActionType;
    old_value: string | null;
    new_value: string;
  }[] = [];

  const planChanged = current.subscription_plan !== plan;
  if (planChanged) {
    updates.subscription_plan = plan;
    auditRows.push({
      action: "plan_change",
      old_value: current.subscription_plan,
      new_value: plan,
    });
  }

  if (plan === "Starter") {
    // Starter never expires. Clearing this only matters when the plan is
    // actually changing away from a paid one -- an unrelated edit while
    // already on Starter has nothing to clear.
    if (planChanged) updates.subscription_expires_at = null;
  } else {
    // A duration applies whenever the admin explicitly picked one. Moving
    // INTO a paid plan with no duration chosen falls back to a 30-day grant
    // -- a paid plan can never end up with no expiry by accident -- but
    // leaving the plan unchanged with no duration chosen touches nothing.
    const durationDays = explicitDurationDays ?? (planChanged ? 30 : null);
    if (durationDays !== null) {
      const newExpiry = extendExpiry(current.subscription_expires_at, durationDays);
      updates.subscription_expires_at = newExpiry;
      auditRows.push({
        action: "renewal",
        old_value: current.subscription_expires_at,
        new_value: newExpiry,
      });
    }
  }

  if (current.region !== region) {
    updates.region = region;
    auditRows.push({
      action: "region_change",
      old_value: current.region,
      new_value: region,
    });
  }
  if (current.role !== role) {
    updates.role = role;
    auditRows.push({
      action: "role_change",
      old_value: current.role,
      new_value: role,
    });
    // Only creators get an inbound alias (§5.1). Moving into 'creator'
    // without one yet generates one; moving away leaves an existing alias in
    // place rather than deleting it -- nothing else depends on this deleting
    // cleanly, and a stale unused alias is harmless.
    if (role === "creator" && !current.inbound_alias) {
      updates.inbound_alias = generateInboundAlias(current.full_name);
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await service
    .from("profiles")
    .update(updates)
    .eq("id", targetId);
  if (error) return;

  await service.from("admin_actions").insert(
    auditRows.map((row) => ({
      ...row,
      admin_id: admin.id,
      target_profile_id: targetId,
    })),
  );

  revalidatePath("/admin/users");
}

/**
 * Ban or unban an account directly from the Accounts page.
 *
 * Distinct from banProfile() in admin/violations/actions.ts, which applies
 * the automatic §6/§12 permanent ban tied to a logged violation and always
 * uses the same fixed reason. This is for admin discretion with no violation
 * on file -- a Discord report, a chargeback, a suspected fraud pattern -- so
 * the reason is admin-entered rather than fixed, and unlike that flow, it can
 * be reversed: an admin's own mistaken ban should not require a database
 * edit to undo.
 */
export async function setBan(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const targetId = String(formData.get("profile_id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!targetId || targetId === admin.id) return;
  if (action !== "ban" && action !== "unban") return;

  const service = createAdminClient();

  if (action === "ban") {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return;

    const { error } = await service
      .from("profiles")
      .update({ banned_at: new Date().toISOString(), banned_reason: reason })
      .eq("id", targetId);
    if (error) return;

    await service.from("admin_actions").insert({
      admin_id: admin.id,
      target_profile_id: targetId,
      action: "ban",
      old_value: null,
      new_value: reason,
    });
  } else {
    const { error } = await service
      .from("profiles")
      .update({ banned_at: null, banned_reason: null })
      .eq("id", targetId);
    if (error) return;

    await service.from("admin_actions").insert({
      admin_id: admin.id,
      target_profile_id: targetId,
      action: "unban",
      old_value: null,
      new_value: null,
    });
  }

  revalidatePath("/admin/users");
}
