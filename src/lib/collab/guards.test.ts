/**
 * Source guards for the collaboration server actions (migration 0026):
 * the actor always comes from the session, never from the form; each action
 * re-checks the role on the server; writes go through the 0026 transition
 * functions; free text is masked before it is stored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const ACTIONS = readFileSync(join(SRC, "app/(app)/collaborations/actions.ts"), "utf8");

function body(fn: string): string {
  const start = ACTIONS.indexOf(`export async function ${fn}(`);
  assert.ok(start >= 0, `${fn} missing`);
  const next = ACTIONS.indexOf("\nexport ", start + 1);
  return ACTIONS.slice(start, next < 0 ? undefined : next);
}

const ROLE: Record<string, RegExp> = {
  saveBrief: /requireRole\("company"\)/,
  publishBrief: /requireRole\("company"\)/,
  archiveBrief: /requireRole\("company"\)/,
  inviteCreator: /requireRole\("company"\)/,
  withdrawInvitation: /requireRole\("company"\)/,
  reviseInvitation: /requireRole\("company"\)/,
  respondToInvitation: /requireRole\("creator"\)/,
  proposeTerms: /await party\(\)/,
  confirmTerms: /await party\(\)/,
  addDeliverable: /requireRole\("company"\)/,
  removeDeliverable: /requireRole\("company"\)/,
  submitDeliverable: /requireRole\("creator"\)/,
  reviewDeliverable: /requireRole\("company"\)/,
  completeCollaboration: /requireRole\("company"\)/,
  cancelCollaboration: /await party\(\)/,
};

test("every action checks the role on the server", () => {
  for (const [fn, re] of Object.entries(ROLE)) assert.match(body(fn), re, fn);
  // party() admits only the two parties' roles, never admin or anon.
  assert.match(ACTIONS, /if \(profile\.role !== "creator" && profile\.role !== "company"\) return null;/);
});

test("the actor is the session's profile id, never a form value", () => {
  for (const fn of Object.keys(ROLE)) {
    const b = body(fn);
    assert.doesNotMatch(b, /fd\.get\("(company_id|actor_id|actor|user_id|profile_id)"\)/, `${fn} reads an actor from the form`);
    for (const m of b.matchAll(/p_(company|creator|actor): ([^,}\n]+)/g)) {
      // The one exception: in inviteCreator, p_creator is the invitee (the
      // subject), validated as a UUID and checked by the database to be a creator.
      if (fn === "inviteCreator" && m[1] === "creator") {
        assert.equal(m[2].trim(), "creatorId");
        continue;
      }
      assert.equal(m[2].trim(), "profile.id", `${fn}: p_${m[1]} is ${m[2]}`);
    }
  }
});

test("brief writes are scoped to the caller's own company row", () => {
  for (const fn of ["publishBrief", "archiveBrief"]) assert.match(body(fn), /\.eq\("company_id", profile\.id\)/, fn);
  assert.match(body("saveBrief"), /\.eq\("company_id", profile\.id\)/);
  assert.match(body("saveBrief"), /company_id: profile\.id, status: "draft"/);
});

test("publishing needs complete company details, like a Discover offer", () => {
  assert.match(body("publishBrief"), /companyDetailsComplete\(profile\)/);
});

test("free text is masked before storage", () => {
  for (const fn of ["saveBrief", "inviteCreator", "reviseInvitation", "respondToInvitation", "proposeTerms", "addDeliverable", "submitDeliverable", "reviewDeliverable", "cancelCollaboration"]) {
    assert.match(body(fn), /cleanText\(profile\.id,/, fn);
  }
});

test("submission links must be https", () => {
  assert.match(ACTIONS, /u\.protocol === "https:"/);
});
