import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fallbackProposals, type FallbackInput } from "./fallback.ts";

const B = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const C2 = "44444444-4444-4444-8444-444444444444";
const K = "55555555-5555-4555-8555-555555555555";

const company = (over: Partial<FallbackInput> = {}): FallbackInput => ({
  role: "company",
  locale: "en",
  intents: ["recommend"],
  scope: { role: "company", publishedBriefIds: new Set([B]), creatorIds: new Set([C1, C2]), invited: new Set(), collaborationIds: new Set([K]) },
  briefs: [{ id: B2, title: "Draft", status: "draft" }, { id: B, title: "Spring launch", status: "published" }],
  recommendations: [{ creator_id: C1, full_name: "Mona Adel" }, { creator_id: C2, full_name: "Omar" }],
  ...over,
});

test("a company gets an invitation for its published brief and the best recommended creator", () => {
  const [p] = fallbackProposals(company());
  assert.equal(p.type, "invitation");
  assert.ok(p.type === "invitation" && p.brief_id === B && p.creator_id === C1);
  assert.match(p.type === "invitation" ? p.message : "", /Hi Mona, .*"Spring launch"/);
});

test("an already-invited creator is skipped; with nobody left there is no invitation", () => {
  const scope = { ...company().scope, invited: new Set([`${B}:${C1}`]) };
  const [p] = fallbackProposals(company({ scope }));
  assert.ok(p.type === "invitation" && p.creator_id === C2);
  const all = { ...scope, invited: new Set([`${B}:${C1}`, `${B}:${C2}`]) };
  assert.deepEqual(fallbackProposals(company({ scope: all })), []);
});

test("no published brief, a draft only, or a creator outside the directory scope: nothing", () => {
  assert.deepEqual(fallbackProposals(company({ briefs: [{ id: B2, title: "Draft", status: "draft" }] })), []);
  const scope = { ...company().scope, creatorIds: new Set<string>() };
  assert.deepEqual(fallbackProposals(company({ scope })), []);
  // A brief the caller does not own (not in publishedBriefIds) is never used.
  const foreign = { ...company().scope, publishedBriefIds: new Set<string>() };
  assert.deepEqual(fallbackProposals(company({ scope: foreign })), []);
});

test("the template follows the person's language", () => {
  const [p] = fallbackProposals(company({ locale: "ar" }));
  assert.match(p.type === "invitation" ? p.message : "", /^مرحبًا Mona/);
  for (const locale of ["fr", "es", "de"] as const) {
    const [q] = fallbackProposals(company({ locale }));
    assert.ok(q.type === "invitation" && q.message.includes("Spring launch"), locale);
  }
});

test("a creator gets a content idea only from a stored official headline, never invented", () => {
  const base: FallbackInput = {
    role: "creator", locale: "en", intents: ["content"],
    scope: { role: "creator", publishedBriefIds: new Set(), creatorIds: new Set(), invited: new Set(), collaborationIds: new Set() },
  };
  assert.deepEqual(fallbackProposals(base), []);
  const [p] = fallbackProposals({ ...base, news: [{ title: "Shorts get a new editor", url: "https://blog.youtube/x", published_at: "2026-11-10T09:00:00Z", source: "YouTube Official Blog" }] });
  assert.equal(p.type, "content_draft");
  assert.ok(p.type === "content_draft" && p.kind === "idea" && p.title === "Shorts get a new editor");
  assert.match(p.type === "content_draft" ? p.body : "", /YouTube Official Blog, 2026-11-10\nhttps:\/\/blog\.youtube\/x/);
});

test("a collaboration waiting on the other side gets a check-in draft, scoped to the caller's own collaborations", () => {
  const input = company({ intents: ["collab"], collaborations: [
    { id: K, title: "Spring launch", next: "review_work" },
    { id: K, title: "Spring launch", next: "wait_for_submission" },
  ] });
  const [p] = fallbackProposals(input);
  assert.ok(p.type === "message_draft" && p.collaboration_id === K && p.text.includes("Spring launch"));
  const outside = company({ intents: ["collab"], collaborations: [{ id: C1, title: "X", next: "wait_for_other_side" }] });
  assert.deepEqual(fallbackProposals(outside), []);
});

test("contact details in data are masked, admins get nothing, and at most two proposals come back", () => {
  const [p] = fallbackProposals(company({ briefs: [{ id: B, title: "Call 01012345678", status: "published" }] }));
  assert.ok(p.type === "invitation" && !p.message.includes("01012345678"));
  assert.deepEqual(fallbackProposals({ ...company(), role: "admin" }), []);
  const many = fallbackProposals(company({ intents: ["recommend", "collab"], collaborations: [{ id: K, title: "T", next: "wait_for_other_side" }] }));
  assert.ok(many.length <= 2);
});

test("the G route uses these only when the AI engine did not answer", () => {
  const route = readFileSync(new URL("../../app/api/g/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(engine === "rules"\)[\s\S]*?fallbackProposals\(/);
});
