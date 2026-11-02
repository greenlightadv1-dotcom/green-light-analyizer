import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allowedProposals, nextStep, proposalTypesFor } from "./collab.ts";
import { G_ACTIONS, allowedActions } from "./actions.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const X = "44444444-4444-4444-8444-444444444444";

const neg = (over = {}) => ({ status: "negotiating" as const, proposed_terms: null, company_confirmed_at: null, creator_confirmed_at: null, ...over });

test("next step follows the collaboration state machine", () => {
  assert.equal(nextStep("creator", neg(), []), "propose_terms");
  assert.equal(nextStep("creator", neg({ proposed_terms: "x" }), []), "confirm_terms");
  assert.equal(nextStep("creator", neg({ proposed_terms: "x", creator_confirmed_at: "t" }), []), "wait_for_other_side");
  const active = { ...neg({ proposed_terms: "x" }), status: "active" as const };
  assert.equal(nextStep("company", active, []), "add_deliverables");
  assert.equal(nextStep("creator", active, [{ status: "revision_requested" }]), "submit_work");
  assert.equal(nextStep("company", active, [{ status: "submitted" }]), "review_work");
  assert.equal(nextStep("creator", active, [{ status: "submitted" }]), "wait_for_review");
  assert.equal(nextStep("company", active, [{ status: "approved" }]), "complete");
  assert.equal(nextStep("company", { ...active, status: "completed" as const }, []), "done");
});

test("proposals: only the user's own ids, the right role, masked text", () => {
  const scope = { role: "company" as const, publishedBriefIds: new Set([A]), creatorIds: new Set([B]), invited: new Set<string>(), collaborationIds: new Set([C]) };
  const out = allowedProposals(
    [
      { type: "invitation", brief_id: A, creator_id: B, message: "Hi! Reach me at boss@example.com" },
      { type: "invitation", brief_id: X, creator_id: B, message: "not my brief" },
      { type: "content_draft", kind: "script", title: "t", body: "b" }, // creator only
      { type: "message_draft", collaboration_id: X, text: "not mine" },
      { type: "send_now", text: "x" },
    ],
    scope,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "invitation");
  assert.doesNotMatch(JSON.stringify(out), /boss@example\.com/);
  assert.deepEqual(allowedProposals([{ type: "invitation", brief_id: A, creator_id: B, message: "x" }], { ...scope, invited: new Set([`${A}:${B}`]) }), []);
  const creator = { ...scope, role: "creator" as const };
  assert.equal(allowedProposals([{ type: "content_draft", kind: "hook", title: "Hook", body: "Line" }, { type: "message_draft", collaboration_id: C, text: "Hello" }, { type: "content_draft", kind: "hook", title: "3rd", body: "x" }], creator).length, 2);
  assert.deepEqual(allowedProposals([{ type: "content_draft", kind: "podcast", title: "x", body: "y" }], creator), []);
  assert.deepEqual(allowedProposals([{ type: "message_draft", collaboration_id: C, text: "x" }], { ...scope, role: "admin" as const }), []);
  assert.deepEqual(proposalTypesFor("admin"), []);
});

test("new navigation actions are scoped to the user's own briefs and collaborations", () => {
  const scope = { role: "company" as const, dealIds: new Set<string>(), creatorIds: new Set<string>(), briefIds: new Set([A]), collaborationIds: new Set([C]) };
  assert.deepEqual(
    allowedActions([{ action: "open_brief", param: A }, { action: "open_brief", param: X }, { action: "open_collaboration", param: C }, { action: "open_content" }], scope),
    [{ action: "open_brief", param: A }, { action: "open_collaboration", param: C }],
  );
  for (const id of Object.keys(G_ACTIONS)) assert.match(id, /^open_/);
});

test("proposals execute only through the ordinary server actions, after a confirmation", () => {
  const cards = readFileSync(new URL("../../components/g/GProposals.tsx", import.meta.url), "utf8");
  assert.match(cards, /ConfirmActionForm/);
  assert.match(cards, /action=\{demo \? [^}]*\}\) : saveContentItem\}/);
  assert.match(cards, /action=\{demo \? [^}]*\}\) : inviteCreator\}/);
  assert.doesNotMatch(cards, /fetch\(|useEffect\(\s*\(\)\s*=>\s*\{[^}]*(saveContentItem|inviteCreator)/, "nothing runs without the user");
  const route = readFileSync(new URL("../../app/api/g/route.ts", import.meta.url), "utf8");
  assert.match(route, /allowedProposals\(result\.value\.proposals, proposalScope\)/);
  assert.match(route, /ungroundedFigures\(proposalText\(p\)/);
});
