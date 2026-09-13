import type { Profile } from "@/lib/auth";
import type { MediaKit } from "@/lib/media-kit/queries";

/**
 * Drives the Dashboard's "Complete your profile" banner. Additive to §7's
 * verified-audience model, not a replacement — this checks the new profile
 * layer (migration 0017) plus whether at least one platform is connected at
 * all, not audience verification itself (a creator on a free platform like
 * Twitch can never verify, and should not be told their profile is
 * "incomplete" for it).
 */
export function isProfileIncomplete(
  profile: Pick<Profile, "bio" | "social_links">,
  kits: Pick<MediaKit, "id">[],
): boolean {
  if (kits.length === 0) return true;
  if (!profile.bio?.trim()) return true;
  if (!profile.social_links || Object.keys(profile.social_links).length === 0) return true;
  return false;
}
