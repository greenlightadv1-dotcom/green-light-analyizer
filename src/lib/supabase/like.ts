/**
 * Escape a value being interpolated into a LIKE/ILIKE pattern.
 *
 * `%` and `_` are wildcards in SQL pattern matching, and both are legal in the
 * local part of an email address — `_` is extremely common. Without this, a
 * lookup for `john_doe@company.com` silently also matches `johnXdoe@…`, and a
 * sender who puts `%` in their address matches rows that have nothing to do
 * with them.
 *
 * PostgreSQL's default LIKE escape character is a backslash, so escaping needs
 * no `ESCAPE` clause — which matters here, because PostgREST's `ilike` operator
 * gives no way to declare one.
 *
 * Escape the *value*; add the wildcards you actually intend around it:
 *
 *   .ilike("sender_email", escapeLikePattern(email))          // exact, case-insensitive
 *   .ilike("sender_email", `%@${escapeLikePattern(domain)}`)  // suffix match
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
