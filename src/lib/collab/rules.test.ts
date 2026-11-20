import { test } from "node:test";
import assert from "node:assert/strict";
import {
  briefActions, collabErrorKey, collaborationActions, deliverableActions, invitationActions, parseAmount, parseBrief,
} from "./rules.ts";

test("refusal codes map to dictionary keys; anything else is generic", () => {
  assert.equal(collabErrorKey('collab:invalid_state'), "collab.errors.invalid_state");
  assert.equal(collabErrorKey("ERROR: collab:deliverables_open"), "collab.errors.deliverables_open");
  assert.equal(collabErrorKey("collab:something_new"), "ui.errors.generic");
  assert.equal(collabErrorKey("duplicate key value"), "ui.errors.generic");
  assert.equal(collabErrorKey(undefined), "ui.errors.generic");
});

test("amounts: plain dollars with up to two decimals, bounded", () => {
  assert.deepEqual(parseAmount("1,250.50"), { ok: true, value: 1250.5 });
  assert.deepEqual(parseAmount(""), { ok: true, value: null });
  assert.deepEqual(parseAmount("", { required: true }), { ok: false });
  for (const bad of ["-1", "1e5", "12.345", "abc", "99999999999"]) assert.equal(parseAmount(bad).ok, false, bad);
});

test("brief parsing validates, normalises and drops unknown values", () => {
  const ok = parseBrief({
    title: "  Launch video ",
    description: "A dedicated review of our app.",
    sponsorship_type: "video_dedicated",
    platforms: "youtube, myspace, youtube",
    target_countries: "eg, SA, xyz",
    categories: "tech, not-a-category",
    budget_min_usd: "500",
    budget_max_usd: "900",
    start_date: "2026-11-10",
    due_date: "2026-12-01",
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.title, "Launch video");
  assert.deepEqual(ok.value.platforms, ["youtube"]);
  assert.deepEqual(ok.value.target_countries, ["EG", "SA"]);
  assert.deepEqual(ok.value.categories, ["tech"]);
  assert.equal(ok.value.sponsorship_type, "video_dedicated");

  const base = { title: "Launch video", description: "A dedicated review of our app." };
  assert.deepEqual(parseBrief({ ...base, title: "x" }), { ok: false, errorKey: "collab.errors.title" });
  assert.deepEqual(parseBrief({ ...base, description: "short" }), { ok: false, errorKey: "collab.errors.description" });
  assert.deepEqual(parseBrief({ ...base, budget_min_usd: "900", budget_max_usd: "500" }), { ok: false, errorKey: "collab.errors.budget_order" });
  assert.deepEqual(parseBrief({ ...base, start_date: "2026-12-01", due_date: "2026-11-01" }), { ok: false, errorKey: "collab.errors.date_order" });
  assert.deepEqual(parseBrief({ ...base, due_date: "2026-13-45" }), { ok: false, errorKey: "collab.errors.date" });
  assert.equal((parseBrief({ ...base, sponsorship_type: "bribe" }) as { value: { sponsorship_type: null } }).value.sponsorship_type, null);
});

test("brief actions by status", () => {
  assert.deepEqual(briefActions("draft"), { edit: true, publish: true, archive: true, invite: false });
  assert.deepEqual(briefActions("published"), { edit: true, publish: false, archive: true, invite: true });
  assert.deepEqual(briefActions("archived"), { edit: false, publish: false, archive: false, invite: false });
});

test("invitation actions mirror the database state machine", () => {
  assert.deepEqual(invitationActions("creator", "pending"), { accept: true, decline: true, requestChanges: true, revise: false, withdraw: false });
  assert.deepEqual(invitationActions("creator", "changes_requested"), { accept: false, decline: true, requestChanges: false, revise: false, withdraw: false });
  assert.deepEqual(invitationActions("company", "changes_requested"), { accept: false, decline: false, requestChanges: false, revise: true, withdraw: true });
  for (const s of ["accepted", "declined", "withdrawn"] as const) {
    assert.ok(Object.values(invitationActions("creator", s)).every((v) => !v), s);
    assert.ok(Object.values(invitationActions("company", s)).every((v) => !v), s);
  }
});

test("collaboration actions: confirm only real terms once per side; complete only when all approved", () => {
  const base = { status: "negotiating" as const, proposed_terms: null, proposed_amount_usd: null, company_confirmed_at: null, creator_confirmed_at: null };
  assert.equal(collaborationActions("company", base, []).confirmTerms, false);
  const proposed = { ...base, proposed_terms: "One video", proposed_amount_usd: 800 };
  assert.equal(collaborationActions("creator", proposed, []).confirmTerms, true);
  assert.equal(collaborationActions("creator", { ...proposed, creator_confirmed_at: "x" }, []).confirmTerms, false);
  assert.equal(collaborationActions("creator", proposed, []).addDeliverable, false);
  const active = { ...proposed, status: "active" as const };
  assert.equal(collaborationActions("company", active, []).complete, false, "no deliverables");
  assert.equal(collaborationActions("company", active, [{ status: "approved" }, { status: "submitted" }]).complete, false);
  assert.equal(collaborationActions("company", active, [{ status: "approved" }]).complete, true);
  assert.equal(collaborationActions("creator", active, [{ status: "approved" }]).complete, false);
  assert.equal(collaborationActions("company", { ...active, status: "completed" }, []).cancel, false);
});

test("deliverable actions", () => {
  assert.deepEqual(deliverableActions("creator", "negotiating", { status: "pending", submitted_at: null }), { submit: false, review: false, remove: false });
  assert.deepEqual(deliverableActions("creator", "active", { status: "revision_requested", submitted_at: "x" }), { submit: true, review: false, remove: false });
  assert.deepEqual(deliverableActions("company", "active", { status: "submitted", submitted_at: "x" }), { submit: false, review: true, remove: false });
  assert.deepEqual(deliverableActions("company", "active", { status: "pending", submitted_at: null }), { submit: false, review: false, remove: true });
});
