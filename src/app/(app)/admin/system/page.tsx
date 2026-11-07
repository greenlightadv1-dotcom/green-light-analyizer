import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { readConfigReport } from "@/lib/config";
import { SystemView } from "./SystemView";

export const metadata: Metadata = { title: "System" };

// Env vars are read at request time, so this must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Deployment readiness. Admin-only.
 *
 * Exists because every integration here degrades quietly by design, which is
 * correct behaviour and also exactly how a deploy ends up half-working with
 * nobody able to say which half. Shows presence only — never a value, never
 * even a prefix.
 */
export default async function SystemPage() {
  await requireRole("admin");
  const report = readConfigReport();

  return <SystemView items={report.items} missingRequired={report.missingRequired} />;
}
