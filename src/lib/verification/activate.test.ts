import { test } from "node:test";
import assert from "node:assert/strict";
import { runActivation, type ActivationDeps, type ClaimRow } from "./activate.ts";

/**
 * runActivation against an in-memory model of the 0032 token rules: a token
 * is claimable once at a time, completes once, and remembers the auth user
 * created for it. The real rules are tested in SQL (verification_test.sql);
 * this checks the sequencing across Supabase Auth.
 */
function world(opts: { approved?: boolean; existingEmail?: boolean; failComplete?: number; failCreate?: boolean } = {}) {
  const token = { claimed: false, claimedUser: null as string | null, completed: false, expired: false };
  const users = new Map<string, string>(); // id -> password
  const profiles = new Set<string>();
  let completeFailures = opts.failComplete ?? 0;
  let n = 0;
  const row = (): ClaimRow => ({ access_request_id: "r1", email: "a@x.test", full_name: "A Creator", journey: "creator", company_name: null, website: null, claimed_user_id: token.claimedUser });
  const deps: ActivationDeps = {
    async claim() {
      if (token.completed) return { row: null, error: "activation:used" };
      if (token.expired) return { row: null, error: "activation:expired" };
      if (opts.approved === false) return { row: null, error: "activation:not_approved" };
      if (token.claimed) return { row: null, error: "activation:in_progress" };
      token.claimed = true;
      return { row: row(), error: null };
    },
    async createAuthUser(_e, pw) {
      if (opts.existingEmail) return { id: null, error: "email_exists" };
      if (opts.failCreate) return { id: null, error: "failed" };
      const id = `u${++n}`;
      users.set(id, pw);
      return { id, error: null };
    },
    async setPassword(id, pw) { if (!users.has(id)) return false; users.set(id, pw); return true; },
    async checkpoint(_h, id) { token.claimedUser = id; return true; },
    async release() { if (!token.claimedUser) token.claimed = false; },
    async complete(_h, id) {
      if (completeFailures-- > 0) return { error: "activation:generic" };
      if (token.completed || token.claimedUser !== id) return { error: "activation:not_claimed" };
      profiles.add(id);
      token.completed = true;
      return { error: null };
    },
    alias: (name) => `${name.toLowerCase().replace(/\W+/g, ".")}.ab12@analyze.test`,
  };
  /** The two-minute window passing: a stale claim may be retaken. */
  const staleClaim = () => { token.claimed = false; };
  return { deps, users, profiles, token, staleClaim };
}

test("happy path: one user, one profile, token spent", async () => {
  const w = world();
  const r = await runActivation(w.deps, "h", "Str0ng!Passw");
  assert.equal(r.ok, true);
  assert.equal(w.users.size, 1);
  assert.equal(w.profiles.size, 1);
  assert.ok(w.token.completed);
});

test("replay: a used link creates nothing more", async () => {
  const w = world();
  await runActivation(w.deps, "h", "Str0ng!Passw");
  const again = await runActivation(w.deps, "h", "Other!Passw0rd");
  assert.deepEqual(again, { ok: false, code: "activation:used" });
  assert.equal(w.users.size, 1);
  assert.equal(w.profiles.size, 1);
});

test("expired or unapproved links never reach Supabase Auth", async () => {
  const exp = world();
  exp.token.expired = true;
  assert.deepEqual(await runActivation(exp.deps, "h", "Str0ng!Passw"), { ok: false, code: "activation:expired" });
  assert.equal(exp.users.size, 0);
  const na = world({ approved: false });
  assert.deepEqual(await runActivation(na.deps, "h", "Str0ng!Passw"), { ok: false, code: "activation:not_approved" });
  assert.equal(na.users.size, 0);
});

test("concurrent submissions: the second is refused while the first holds the claim", async () => {
  const w = world();
  const [a, b] = await Promise.all([runActivation(w.deps, "h", "Str0ng!Passw"), runActivation(w.deps, "h", "Str0ng!Passw")]);
  const oks = [a, b].filter((x) => x.ok).length;
  assert.equal(oks, 1);
  assert.equal(w.users.size, 1);
});

test("auth user creation fails: the claim is released and a retry succeeds", async () => {
  const w = world({ failCreate: true });
  assert.deepEqual(await runActivation(w.deps, "h", "Str0ng!Passw"), { ok: false, code: "activation:generic" });
  assert.equal(w.token.claimed, false);
  const ok = world();
  assert.equal((await runActivation(ok.deps, "h", "Str0ng!Passw")).ok, true);
});

test("an address that already has an account is reported, nothing created", async () => {
  const w = world({ existingEmail: true });
  assert.deepEqual(await runActivation(w.deps, "h", "Str0ng!Passw"), { ok: false, code: "activation:email_exists" });
  assert.equal(w.profiles.size, 0);
});

test("crash after the auth user exists: the retry reuses it, never a second user", async () => {
  const w = world({ failComplete: 1 });
  assert.equal((await runActivation(w.deps, "h", "First!Passw0rd")).ok, false);
  assert.equal(w.users.size, 1);
  assert.equal(w.profiles.size, 0);
  // Within the claim window the token is busy.
  assert.deepEqual(await runActivation(w.deps, "h", "Second!Passw0rd"), { ok: false, code: "activation:in_progress" });
  w.staleClaim();
  const r = await runActivation(w.deps, "h", "Second!Passw0rd");
  assert.equal(r.ok, true);
  assert.equal(w.users.size, 1, "the same auth user was reused");
  assert.equal([...w.users.values()][0], "Second!Passw0rd", "the password chosen last is the one set");
  assert.equal(w.profiles.size, 1);
});

test("only creators get an inbound alias", async () => {
  const w = world();
  let alias: string | null | undefined;
  const deps = { ...w.deps, complete: async (h: string, id: string, a: string | null) => { alias = a; return w.deps.complete(h, id, a); } };
  await runActivation(deps, "h", "Str0ng!Passw");
  assert.match(alias ?? "", /@analyze\.test$/);
});
