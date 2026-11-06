/**
 * Password rules for an account an applicant creates from an activation link
 * (CLAUDE.md §16 item 5: at least 10 characters, with digits, upper- and
 * lower-case letters and symbols; 72 is bcrypt's input limit).
 *
 * There is no self-registration: an account exists only after a reviewer
 * approves the application (docs/ACCOUNT_ACTIVATION_FLOW.md). Supabase Auth's
 * own sign-up endpoint must also be disabled in the project settings, or the
 * public anon key could create auth users directly (PRODUCTION_READINESS).
 *
 * Pure — tested in registration.test.ts.
 */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("length");
  if (!/[0-9]/.test(pw)) out.push("digit");
  if (!/[a-z]/.test(pw)) out.push("lower");
  if (!/[A-Z]/.test(pw)) out.push("upper");
  if (!/[^A-Za-z0-9]/.test(pw)) out.push("symbol");
  if (pw.length > 72) out.push("long");
  return out;
}
