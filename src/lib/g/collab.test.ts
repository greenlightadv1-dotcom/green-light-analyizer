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

// --- brief_draft proposals and opportunity matching --------------------------
import { matchOpportunities, proposalText as briefText } from "./collab.ts";

const companyScope = { role: "company" as const, publishedBriefIds: new Set<string>(), creatorIds: new Set<string>(), invited: new Set<string>(), collaborationIds: new Set<string>() };
const draft = { type: "brief_draft", title: "Spring launch", description: "Gaming creators in Egypt for our launch", platforms: ["youtube", "bad id!"], categories: ["gaming"], target_countries: ["eg", "Egypt", "SA"], budget_min_usd: 500, budget_max_usd: 2000 };

test("a brief draft is company-only, cleaned, and never carries invalid ids", () => {
  const [p] = allowedProposals([draft], companyScope);
  assert.ok(p && p.type === "brief_draft");
  if (p.type !== "brief_draft") return;
  assert.deepEqual(p.platforms, ["youtube"]);
  assert.deepEqual(p.target_countries, ["EG", "SA"]);
  assert.equal(p.budget_max_usd, 2000);
  assert.deepEqual(allowedProposals([draft], { ...companyScope, role: "creator" }), []);
  assert.deepEqual(allowedProposals([{ ...draft, title: "x" }], companyScope), [], "too-short title");
  assert.deepEqual(allowedProposals([{ ...draft, description: "short" }], companyScope), [], "too-short description");
  const [q] = allowedProposals([{ ...draft, budget_min_usd: 5000, budget_max_usd: 100 }], companyScope);
  assert.ok(q.type === "brief_draft" && q.budget_min_usd === null, "a min above the max is dropped, not swapped");
  const [m] = allowedProposals([{ ...draft, description: "Call me on 01012345678 about the launch" }], companyScope);
  assert.ok(m.type === "brief_draft" && !m.description.includes("01012345678"), "contact details are masked");
  assert.match(briefText(p), /2000/, "budgets go through the grounding check");
  assert.ok(proposalTypesFor("company").includes("brief_draft"));
  assert.ok(!proposalTypesFor("creator").includes("brief_draft"));
});

const brief = (id: string, over: Record<string, unknown> = {}) => ({ id, title: id, platforms: null, categories: null, target_countries: null, budget_min_usd: null, budget_max_usd: null, due_date: null, ...over });

test("opportunities: only briefs that match something, best first, with the reasons and the gaps", () => {
  const me = { categories: ["gaming", "tech"], platforms: ["youtube"], countries: ["EG", "SA"] };
  const out = matchOpportunities(me, [
    brief("none", { categories: ["beauty"] }),
    brief("one", { categories: ["gaming"], platforms: ["tiktok"] }),
    brief("three", { categories: ["tech"], platforms: ["youtube"], target_countries: ["eg"] }),
    brief("unstated"),
  ], new Set(["three"]));
  assert.deepEqual(out.map((o) => o.brief_id), ["three", "one"]);
  assert.deepEqual(out[0].matched.map((m) => m.kind), ["category", "platform", "country"]);
  assert.deepEqual(out[0].matched[2].values, ["EG"]);
  assert.equal(out[0].invited, true);
  assert.deepEqual(out[1].unmatched, ["platform"]);
  assert.equal(out[1].invited, false);
});

test("opportunities: a creator with no profile data matches nothing rather than everything", () => {
  assert.deepEqual(matchOpportunities({ categories: [], platforms: [], countries: [] }, [brief("a", { categories: ["gaming"] })], new Set()), []);
});

test("a brief draft's idempotency key never comes from the model: the filter drops it and the route assigns one", () => {
  const [p] = allowedProposals([{ ...draft, request_key: "11111111-1111-4111-8111-111111111111" }], companyScope);
  assert.ok(p.type === "brief_draft" && p.request_key === undefined);
  const route = readFileSync(new URL("../../app/api/g/route.ts", import.meta.url), "utf8");
  assert.match(route, /p\.type === "brief_draft" \? \{ \.\.\.p, request_key: randomUUID\(\) \}/);
  const action = readFileSync(new URL("../../app/(app)/collaborations/actions.ts", import.meta.url), "utf8");
  assert.match(action, /error\?\.code === "23505" && requestKey/, "a duplicate key is answered with the existing brief");
});
