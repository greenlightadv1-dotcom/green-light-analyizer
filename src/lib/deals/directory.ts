import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CreatorDirectoryEntry } from "@/lib/types/database";

/**
 * The company-facing creator directory (§3, migration 0010).
 *
 * Goes through the *user's* client and calls the `creator_directory()` RPC —
 * a SECURITY DEFINER function, not a table read — so a company gets exactly
 * the columns the function names (id, full_name, region, no-PII media_kit
 * stats) and nothing a raw `select * from profiles` on a creator's row would
 * carry. The function itself returns zero rows for anyone who isn't a
 * company or admin, so there is no separate check to duplicate here.
 */
export async function listCreatorDirectory(): Promise<CreatorDirectoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_directory");
  if (error) {
    console.error("creator_directory RPC failed", error.message);
    return [];
  }
  return data ?? [];
}
