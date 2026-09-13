import type { Database, Platform } from "@/lib/types/database";

export type MediaKit = Database["public"]["Tables"]["media_kits"]["Row"];

export function kitByPlatform(kits: MediaKit[]): Map<Platform, MediaKit> {
  return new Map(kits.map((k) => [k.platform, k]));
}
