import "server-only";

import { createClient } from "@/lib/supabase/server";
export type { MediaKit } from "./helpers";
export { kitByPlatform } from "./helpers";
import type { MediaKit } from "./helpers";

/**
 * Reads for the Media Kit page. Uses the caller's client, so RLS decides what
 * comes back — a creator sees only their own kits without this filtering.
 */
export async function listMediaKits(creatorId: string): Promise<MediaKit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_kits")
    .select("*")
    .eq("creator_id", creatorId)
    .order("avg_views", { ascending: false });
  return data ?? [];
}
