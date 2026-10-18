import { maskSensitiveData } from "./mask.ts";

/**
 * The one way server code writes to the logs.
 *
 * One JSON object per line, so Vercel's log search (or a drain) can filter on
 * `event` or any field rather than grepping prose — and one place that decides
 * what is allowed to reach a log at all (§12):
 *
 *  - Every string value passes the §6.1 masker, so an email address, phone
 *    number or WhatsApp link riding in on a third-party error message is
 *    redacted the same way chat is. Resend's 403 names the account's own
 *    address, and Postgres errors can quote a row. A UUID is exempt: ids are
 *    what make a line traceable, and the phone rule would eat their 12-digit
 *    tail.
 *  - An object is never serialized whole. It is reduced to name, message,
 *    code and status, because a PostgrestError's `details` quotes row values
 *    and a fetch error's `cause` can carry the request.
 *  - Strings are capped. That is a backstop, not permission: callers still
 *    never pass offer text, chat text, email bodies or response bodies.
 *
 * Levels: `error` — an operation failed or data was lost and someone should
 * look; `warn` — degraded but handled (a fallback ran, an optional integration
 * is off, a request was refused); `info` — worth knowing, nothing wrong.
 */

export type LogLevel = "error" | "warn" | "info";
export type LogFields = Record<string, unknown>;
export type LogSink = (level: LogLevel, line: string) => void;

const MAX_STRING = 300;
const MAX_ARRAY = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanString(value: string): string {
  if (UUID.test(value)) return value;
  // Masked before the final cut, so the cap cannot split an address into a
  // fragment the masker no longer recognises. The first cut only bounds the
  // masker's own work.
  const masked = maskSensitiveData(value.slice(0, MAX_STRING * 4)).maskedText;
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked;
}

function describeError(value: object): Record<string, string | number> {
  const e = value as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  if (typeof e.name === "string" && e.name !== "Error") out.name = cleanString(e.name);
  if (typeof e.message === "string") out.message = cleanString(e.message);
  if (typeof e.code === "string") out.code = cleanString(e.code);
  if (typeof e.code === "number") out.code = e.code;
  if (typeof e.status === "number") out.status = e.status;
  return out;
}

function cleanValue(value: unknown): unknown {
  switch (typeof value) {
    case "string":
      return cleanString(value);
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "object":
      if (value === null) return null;
      if (Array.isArray(value)) {
        return value
          .slice(0, MAX_ARRAY)
          .map((item) => (typeof item === "object" && item !== null ? "[object]" : cleanValue(item)));
      }
      return describeError(value);
    default:
      // undefined, functions, symbols: nothing worth a log line.
      return undefined;
  }
}

export function createLogger(sink: LogSink) {
  const seen = new Set<string>();

  function write(level: LogLevel, event: string, fields?: LogFields) {
    let line: string;
    try {
      const entry: Record<string, unknown> = { level, event };
      for (const [key, raw] of Object.entries(fields ?? {})) {
        if (key === "level" || key === "event") continue;
        const value = cleanValue(raw);
        if (value !== undefined) entry[key] = value;
      }
      line = JSON.stringify(entry);
    } catch {
      // A getter that throws, a hostile toString: the event still gets out.
      line = JSON.stringify({ level, event, log_error: true });
    }
    sink(level, line);
  }

  return {
    error: (event: string, fields?: LogFields) => write("error", event, fields),
    warn: (event: string, fields?: LogFields) => write("warn", event, fields),
    info: (event: string, fields?: LogFields) => write("info", event, fields),
    /**
     * Once per server instance for a given event + fields. For "this optional
     * integration is not configured": true on every request, so repeating it
     * on every deal buries the lines that are actually news.
     */
    warnOnce(event: string, fields?: LogFields) {
      const key = `${event}\u0000${JSON.stringify(fields ?? {})}`;
      if (seen.has(key)) return;
      seen.add(key);
      write("warn", event, fields);
    },
  };
}

export const log = createLogger((level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
});
