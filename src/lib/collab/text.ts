import "server-only";

import { maskSensitiveData } from "@/lib/mask";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

/**
 * Every free-text field in the collaboration workflow (brief, invitation
 * message, response, terms, deliverable notes) goes through the same mask as
 * chat before it is stored, so contact details cannot leave the platform
 * through a brief instead of a message. A masked field is logged for admin
 * review exactly as chat does (chat_id null: it did not come from a room).
 */
export async function cleanText(profileId: string, raw: string | null | undefined): Promise<string | null> {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const { maskedText, isMasked, matched } = maskSensitiveData(text);
  if (isMasked) {
    const { error } = await createAdminClient().from("violation_logs").insert({
      profile_id: profileId,
      chat_id: null,
      message_id: null,
      matched_rules: matched,
      redacted_excerpt: maskedText.slice(0, 500),
    });
    if (error) log.error("violation_log.insert_failed", { source: "collaboration", error });
  }
  return maskedText;
}
