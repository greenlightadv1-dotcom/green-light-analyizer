/**
 * A timestamp that renders identically on the server and in every browser:
 * "2026-11-02 14:05 UTC". Locale- and timezone-dependent formatting
 * (toLocaleString) in a client component rendered on the server produces a
 * hydration mismatch whenever the visitor's timezone differs from the
 * server's, so admin screens use this instead. Returns "" for missing or
 * invalid input. Pure.
 */
export function utcStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t).toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ
  return `${d.slice(0, 10)} ${d.slice(11, 16)} UTC`;
}
