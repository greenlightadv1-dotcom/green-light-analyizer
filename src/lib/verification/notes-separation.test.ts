import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../../", import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(join(SRC, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(SRC, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

test("no applicant-facing code reads internal notes or enhanced-review flags", () => {
  const applicant = [
    ...files("app/apply"),
    ...files("app/verification"),
    ...files("app/activate"),
    ...files("app/get-started"),
    ...files("app/api/applications"),
    ...files("app/api/verification"),
    ...files("components/apply"),
    ...files("components/verification"),
    ...files("components/get-started"),
    "lib/verification/application.ts",
    "lib/verification/server.ts",
    "lib/verification/email.ts",
    // G for applicants (Phase 1E)
    ...files("app/api/g/applicant"),
    "lib/g/applicant.ts",
    "components/g/GApplicantHelp.tsx",
  ];
  assert.ok(applicant.length > 15);
  for (const f of applicant) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.doesNotMatch(src, /verification_notes|verification_flags|internal_note|verification_flag\b/, f);
  }
});

test("G's applicant path never reads match keys, flag approvals or reviewer identity, and takes no email or id", () => {
  for (const f of [...files("app/api/g/applicant"), "lib/g/applicant.ts"]) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.doesNotMatch(src, /verification_match_keys|verification_flag_approvals|verification_reviewers|reviewed_by|storage_path|enhanced_review/, f);
  }
  const route = readFileSync(join(SRC, "app/api/g/applicant/route.ts"), "utf8");
  // Identity is the cookie or the session; the body is parsed only for the question.
  assert.match(route, /currentApplication\(\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(route, /req\.(email|id|request_id|case_id)|body\.(email|id)/);
});

test("internal notes go only to the reviewer-only function, never into email, history or logs", () => {
  const actions = readFileSync(join(SRC, "app/(app)/admin/verification/actions.ts"), "utf8");
  // Every use of the internal note value is an argument of verification_add_note / verification_flag.
  const uses = [...actions.matchAll(/\b(internal|body)\b/g)].length;
  assert.ok(uses > 0);
  assert.match(actions, /rpc\("verification_add_note", \{ p_actor: actorId, p_case: caseId, p_body: body \}\)/);
  assert.match(actions, /rpc\("verification_flag", \{ p_actor: admin\.id, p_case: caseId, p_reason: reason, p_note: body \}\)/);
  // Emails take the applicant-facing `note` only.
  for (const m of actions.matchAll(/(decisionEmail|notifyDecision|sendResumeLink)\(([^;]*)\)/g)) assert.doesNotMatch(m[2], /internal|body/, m[0]);
  assert.doesNotMatch(actions, /log\.[a-z]+\([^)]*(internal|body)\b/);
  assert.doesNotMatch(actions, /from\("verification_events"\)\.insert\([^;]*(internal|body)/);
  // The reviewer page reads notes and flags with the reviewer's own session (RLS), not the service role.
  const page = readFileSync(join(SRC, "app/(app)/admin/verification/[id]/page.tsx"), "utf8");
  assert.match(page, /supabase\.from\("verification_notes"\)/);
  assert.doesNotMatch(page, /service\.from\("verification_(notes|flags)"\)/);
});
