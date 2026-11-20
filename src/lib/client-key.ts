import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * A rate-limit subject for an anonymous visitor: a truncated SHA-256 of the
 * client address, never the address itself (CLAUDE.md §12 logging rules).
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}
