/**
 * Account activation, orchestrated (docs/ACCOUNT_ACTIVATION_FLOW.md).
 *
 * The database decides every rule (approved, unexpired, unused, one caller at
 * a time). This function only sequences the steps that cross into Supabase
 * Auth, so a failure at any point leaves a state the next attempt can finish:
 *
 *   1. claim       lock the token (refuses used / expired / revoked / busy)
 *   2. auth user   create it, or reuse the one a crashed attempt created
 *   3. checkpoint  record that user id on the token before anything else
 *   4. complete    one transaction: profile, case links, application status,
 *                  representative link, history, token marked used
 *
 * If step 2 fails no user exists, so the claim is released and the person
 * can retry at once. If step 4 fails the user exists and is recorded; a retry
 * after the two-minute claim window reuses it (password reset to the one just
 * chosen) and completes. One token can never produce two accounts: the token
 * row is locked, and completion requires the checkpointed user.
 *
 * Dependencies are injected, so the real sequence is unit-tested
 * (activate.test.ts) without Supabase.
 */

export type ClaimRow = {
  access_request_id: string;
  email: string;
  full_name: string;
  journey: "creator" | "company" | "company_representative";
  company_name: string | null;
  website: string | null;
  claimed_user_id: string | null;
};

export type ActivationDeps = {
  claim(hash: string): Promise<{ row: ClaimRow | null; error: string | null }>;
  createAuthUser(email: string, password: string): Promise<{ id: string | null; error: "email_exists" | "failed" | null }>;
  setPassword(userId: string, password: string): Promise<boolean>;
  checkpoint(hash: string, userId: string): Promise<boolean>;
  release(hash: string): Promise<void>;
  complete(hash: string, userId: string, alias: string | null): Promise<{ error: string | null }>;
  alias(fullName: string): string;
};

export type ActivationResult =
  | { ok: true; userId: string; email: string; journey: ClaimRow["journey"] }
  | { ok: false; code: string };

export async function runActivation(deps: ActivationDeps, hash: string, password: string): Promise<ActivationResult> {
  const claimed = await deps.claim(hash);
  if (!claimed.row) return { ok: false, code: claimed.error ?? "activation:generic" };
  const row = claimed.row;

  let userId = row.claimed_user_id;
  if (userId) {
    // A previous attempt created the user and stopped; finish it.
    if (!(await deps.setPassword(userId, password))) return { ok: false, code: "activation:generic" };
  } else {
    const created = await deps.createAuthUser(row.email, password);
    if (!created.id) {
      await deps.release(hash);
      return { ok: false, code: created.error === "email_exists" ? "activation:email_exists" : "activation:generic" };
    }
    userId = created.id;
    if (!(await deps.checkpoint(hash, userId))) return { ok: false, code: "activation:generic" };
  }

  const alias = row.journey === "creator" ? deps.alias(row.full_name) : null;
  const done = await deps.complete(hash, userId, alias);
  if (done.error) return { ok: false, code: done.error };
  return { ok: true, userId, email: row.email, journey: row.journey };
}
