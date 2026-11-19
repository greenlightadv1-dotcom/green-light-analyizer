import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { storeUpload } from "@/lib/upload-server";
import { UPLOAD_RULES } from "@/lib/uploads";
import { log } from "@/lib/log";
import type { SocialLinks } from "@/lib/types/database";
import { BUCKET } from "./documents-server";
import { publicProfileFromDetails } from "./public-profile";

/**
 * After activation, carry what a creator chose to make PUBLIC on their
 * application into the new profile (docs/REGISTRATION_ONBOARDING_FLOW.md):
 *
 * - the public profile photo: copied from the private verification bucket
 *   into the public avatars bucket through the same checks as a normal avatar
 *   upload. The identity images (selfie, ID) are never touched here;
 * - the main platform and handle (profiles.social_links) and the categories
 *   (profiles.creator_categories; the 0033 taxonomy trigger re-checks them).
 *
 * Best effort and idempotent: the account already exists and works, so a
 * failure is logged and the creator can set these on their profile. Nothing
 * here touches portfolio visibility, which the creator chooses themselves.
 */
export async function carryOverPublicProfile(userId: string, requestId: string): Promise<void> {
  try {
    const service = createAdminClient();
    const { data: c } = await service
      .from("verification_cases")
      .select("id, details")
      .eq("access_request_id", requestId)
      .eq("kind", "creator_kyc")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!c) return;

    const pub = publicProfileFromDetails(c.details ?? {});
    const { data: profile } = await service.from("profiles").select("social_links, creator_categories, avatar_url").eq("id", userId).maybeSingle();
    if (!profile) return;
    const patch: { social_links?: SocialLinks; creator_categories?: string[] } = {};
    if (pub.socialLinks && !Object.keys(profile.social_links ?? {}).length) patch.social_links = pub.socialLinks;
    if (pub.categories.length && !(profile.creator_categories ?? []).length) patch.creator_categories = pub.categories;
    if (Object.keys(patch).length) {
      const { error } = await service.from("profiles").update(patch).eq("id", userId);
      if (error) log.warn("activation.public_fields_failed", { error });
    }

    if (profile.avatar_url) return;
    const { data: doc } = await service
      .from("verification_documents")
      .select("storage_path, mime")
      .eq("case_id", c.id)
      .eq("doc_type", "profile_photo")
      .is("removed_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!doc) return;
    const { data: blob, error: dlError } = await service.storage.from(BUCKET).download(doc.storage_path);
    if (!blob || dlError) {
      log.warn("activation.photo_download_failed", { error: dlError });
      return;
    }
    const stored = await storeUpload("avatar", userId, new File([blob], "profile", { type: doc.mime }));
    if (!stored.ok) {
      log.warn("activation.photo_store_failed", { reason: stored.error });
      return;
    }
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${UPLOAD_RULES.avatar.bucket}/`;
    const { error } = await service.from("profiles").update({ avatar_url: `${base}${stored.file.path}` }).eq("id", userId).is("avatar_url", null);
    if (error) {
      await service.storage.from(UPLOAD_RULES.avatar.bucket).remove([stored.file.path]);
      log.warn("activation.photo_profile_failed", { error });
    }
  } catch (error) {
    log.warn("activation.carry_over_failed", { error });
  }
}
