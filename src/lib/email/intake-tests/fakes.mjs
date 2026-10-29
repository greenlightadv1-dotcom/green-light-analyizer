/**
 * In-memory stand-ins for the five boundaries intake.ts crosses (see
 * loader.mjs). Only the query-builder surface intake.ts actually calls is
 * implemented. Not a model of PostgREST or Postgres: concurrency semantics
 * are tested against a real Postgres by scripts/claim-concurrency-pg.sh.
 */

/**
 * @type {{
 *   db: Record<string, Record<string, unknown>[]>,
 *   evaluations: { input: unknown, options: { deadlineAt?: number } | undefined }[],
 *   notifications: number,
 *   killWhen: null | ((table: string, op: string, row: Record<string, unknown> | undefined) => boolean),
 *   seq: number,
 * }}
 */
export const state = {
  db: { profiles: [], inbound_emails: [], deal_chats: [], messages: [], media_kits: [], violation_logs: [] },
  evaluations: [],
  notifications: 0,
  /** (table, op, row) => boolean. Returning true throws, like a killed function. */
  killWhen: null,
  seq: 0,
};

export function reset() {
  for (const t of Object.keys(state.db)) state.db[t] = [];
  state.evaluations = [];
  state.notifications = 0;
  state.killWhen = null;
  state.seq = 0;
}

export class SimulatedKill extends Error {}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function likeToRegExp(pattern, flags) {
  // Unescape the intake's LIKE escaping (\%, \_, \\) into literals.
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) re += escapeRe(pattern[++i]);
    else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`, flags);
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.op = "select";
    this.one = false;
    this.returning = false;
    this.max = Infinity;
    this.sort = null;
  }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  select() { if (this.op !== "select") this.returning = true; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  ilike(c, p) { const re = likeToRegExp(p, "i"); this.filters.push((r) => re.test(r[c] ?? "")); return this; }
  like(c, p) { const re = likeToRegExp(p, ""); this.filters.push((r) => re.test(r[c] ?? "")); return this; }
  order(c, o) { this.sort = { c, asc: o?.ascending !== false }; return this; }
  limit(n) { this.max = n; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(resolve, reject) {
    // Resolve on a later microtask, so concurrent callers interleave.
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  run() {
    const rows = state.db[this.table];
    if (state.killWhen?.(this.table, this.op, this.row ?? this.patch)) {
      throw new SimulatedKill(`killed at ${this.table}.${this.op}`);
    }
    if (this.op === "insert") {
      if (this.table === "inbound_emails" && rows.some((r) => r.provider_message_id === this.row.provider_message_id)) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      const seq = ++state.seq;
      const row = { id: `${this.table}-${seq}`, created_at: new Date(Date.UTC(2026, 9, 29, 12, 0, 0, seq)).toISOString(), ...this.row };
      rows.push(row);
      return { data: this.one ? { id: row.id } : [{ id: row.id }], error: null };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch);
      return { data: this.returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
    }
    let out = [...hit];
    if (this.sort) {
      const { c, asc } = this.sort;
      out.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
    }
    out = out.slice(0, this.max).map((r) => ({ ...r }));
    return { data: this.one ? (out[0] ?? null) : out, error: null };
  }
}

export function createAdminClient() {
  return { from: (table) => new Query(table) };
}

export async function evaluateOffer(input, options) {
  state.evaluations.push({ input, options });
  return {
    risk: "yellow",
    risk_capped: false,
    recommended_price_usd: 800,
    price_range_usd: { low: 600, high: 1000 },
    reasoning: "fixture evaluation",
    geo_basis: "none",
    engine: "nvidia",
  };
}

export async function runSecurityCheck() {
  return null;
}

export function notifyNewDeal() {
  state.notifications++;
}

