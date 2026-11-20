import "server-only";

import { requireRole, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verification reviewers (0032 verification_reviewers). Being an admin is not
 * enough to see identity documents: the owner grants review explicitly.
 * Checked here for the pages and actions, and again by the database
 * (private.is_verification_reviewer) in every transition and policy.
 */
export async function isVerificationReviewer(profileId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("verification_reviewers").select("admin_id").eq("admin_id", profileId).maybeSingle();
  return !error && !!data;
}

/** The session's admin, if they are a reviewer; otherwise null (the caller shows "not a reviewer"). */
export async function requireReviewer(): Promise<{ admin: Profile; reviewer: boolean }> {
  const admin = await requireRole("admin");
  return { admin, reviewer: await isVerificationReviewer(admin.id) };
}
