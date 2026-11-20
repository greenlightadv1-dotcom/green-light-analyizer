import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import type { VerificationKind } from "@/lib/types/database";
import { STRONG_SIGNALS, fingerprint, matchInputs, prepareIdNumberWith, type MatchSignal } from "./match-keys";

/**
 * Server half of duplicate-identity fingerprints (0041). The HMAC key is
 * derived from the service-role key with its own label (the same pattern as
 * the signed Discover and Analyzer quotes), so there is no new secret to
 * manage. Rotating the service-role key changes every fingerprint: old cases
 * stop matching new ones until their keys are rewritten (they are rewritten
 * whenever a case is saved, submitted or opened by a reviewer). The ID
 * number cannot be rewritten that way, because its plaintext is never kept.
 */
function matchKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("match key unavailable");
  return createHash("sha256").update(`green-light:verification-match:v1:${secret}`).digest();
}

export function idNumberFingerprint(normalized: string): string {
  return fingerprint(matchKey(), "id_number", normalized);
}

/**
 * Store a case's fingerprints. Signals derived from the details are replaced;
 * the ID-number fingerprint is written only when given (a save of the step
 * that holds it) and otherwise left as it is. Best effort: matching is a
 * reviewer aid, so a failure is logged and never blocks the applicant.
 */
export async function writeMatchKeys(caseId: string, kind: VerificationKind, details: Record<string, string>, idFingerprint: string | null = null): Promise<void> {
  try {
    const key = matchKey();
    const rows = matchInputs(kind, details).map((m) => ({ case_id: caseId, signal: m.signal, fingerprint: fingerprint(key, m.signal, m.value), updated_at: new Date().toISOString() }));
    if (idFingerprint) rows.push({ case_id: caseId, signal: "id_number", fingerprint: idFingerprint, updated_at: new Date().toISOString() });
    const service = createAdminClient();
    const present = new Set(rows.map((r) => r.signal));
    const stale = (["name_dob", "phone", "registration_number", "tax_number"] as MatchSignal[]).filter((s) => !present.has(s));
    if (stale.length) await service.from("verification_match_keys").delete().eq("case_id", caseId).in("signal", stale);
    if (rows.length) {
      const { error } = await service.from("verification_match_keys").upsert(rows, { onConflict: "case_id,signal" });
      if (error && error.code !== "42P01" && error.code !== "PGRST205") log.warn("verification.match_keys_failed", { error });
    }
  } catch (error) {
    log.warn("verification.match_keys_failed", { error });
  }
}

export type DuplicateMatch = { signal: MatchSignal; strong: boolean; cases: { id: string; kind: VerificationKind; status: string }[] };

/** Other cases sharing a fingerprint with this one (reviewer page only; returns no values, only which signal matched). */
export async function duplicateMatches(caseId: string): Promise<DuplicateMatch[]> {
  const service = createAdminClient();
  const { data: mine, error } = await service.from("verification_match_keys").select("signal, fingerprint").eq("case_id", caseId);
  if (error || !mine?.length) return [];
  const out: DuplicateMatch[] = [];
  for (const k of mine) {
    const { data: others } = await service
      .from("verification_match_keys")
      .select("case_id")
      .eq("signal", k.signal)
      .eq("fingerprint", k.fingerprint)
      .neq("case_id", caseId)
      .limit(20);
    const ids = (others ?? []).map((o) => o.case_id);
    if (!ids.length) continue;
    const { data: cases } = await service.from("verification_cases").select("id, kind, status").in("id", ids);
    out.push({ signal: k.signal as MatchSignal, strong: STRONG_SIGNALS.includes(k.signal as MatchSignal), cases: cases ?? [] });
  }
  return out;
}

/** Fingerprint and mask the ID number of a step's form (see prepareIdNumberWith). */
export function prepareIdNumber(kind: VerificationKind, raw: Record<string, string>) {
  return prepareIdNumberWith(kind, raw, idNumberFingerprint);
}
