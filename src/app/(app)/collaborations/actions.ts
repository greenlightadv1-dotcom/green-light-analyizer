"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { companyDetailsComplete } from "@/lib/onboarding";
import { cleanText } from "@/lib/collab/text";
import { collabErrorKey, LIMITS, parseAmount, parseBrief, parseDay } from "@/lib/collab/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * The collaboration lifecycle (migration 0026), server side.
 *
 * Every action re-checks the caller's role from the session and passes the
 * session's own profile id to the database; ids for the *subject* (brief,
 * invitation, collaboration, deliverable) come from the form, and the
 * database functions refuse any subject the caller is not a party to.
 * Writes run on the service role because 0026 grants signed-in users read
 * access only. Free text is masked (lib/collab/text.ts) before it is stored.
 * Success is returned only after the database confirmed the change.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (fd: FormData, name: string) => {
  const v = String(fd.get(name) ?? "");
  return UUID.test(v) ? v : null;
};
const str = (fd: FormData, name: string) => String(fd.get(name) ?? "");

function refresh(...paths: string[]) {
  for (const p of ["/briefs", "/opportunities", "/collaborations", "/notifications", ...paths]) revalidatePath(p);
}

/** Call a 0026 transition; map a refusal to a translated key. */
async function transition<T>(
  name: string,
  call: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ ok: true; data: T | null } | { ok: false; result: ActionResult }> {
  const { data, error } = await call();
  if (error) {
    const key = collabErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("collab.transition_failed", { fn: name, error });
    return { ok: false, result: fail(key) };
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Briefs (company)
// ---------------------------------------------------------------------------

export type BriefFormState = { ok: boolean; errorKey: string | null; id: string | null };

/** Create a draft brief, or edit one of the company's own non-archived briefs. */
export async function saveBrief(_prev: BriefFormState | null, fd: FormData): Promise<BriefFormState> {
  const profile = await requireRole("company");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked && !blocked.ok) return { ok: false, errorKey: blocked.errorKey, id: null };

  const parsed = parseBrief({
    title: fd.get("title"),
    description: fd.get("description"),
    sponsorship_type: fd.get("sponsorship_type"),
    platforms: fd.getAll("platforms").map(String),
    target_countries: fd.get("target_countries"),
    categories: fd.getAll("categories").map(String),
    deliverables_summary: fd.get("deliverables_summary"),
    budget_min_usd: fd.get("budget_min_usd"),
    budget_max_usd: fd.get("budget_max_usd"),
    start_date: fd.get("start_date"),
    due_date: fd.get("due_date"),
  });
  if (!parsed.ok) return { ok: false, errorKey: parsed.errorKey, id: null };

  const v = parsed.value;
  const row = {
    ...v,
    title: (await cleanText(profile.id, v.title)) ?? v.title,
    description: (await cleanText(profile.id, v.description)) ?? v.description,
    deliverables_summary: await cleanText(profile.id, v.deliverables_summary),
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const briefId = id(fd, "brief_id");
  if (briefId) {
    const { data, error } = await admin
      .from("briefs")
      .update(row)
      .eq("id", briefId)
      .eq("company_id", profile.id)
      .neq("status", "archived")
      .select("id");
    if (error) {
      log.error("brief.update_failed", { brief_id: briefId, error });
      return { ok: false, errorKey: "ui.errors.generic", id: null };
    }
    if (!data?.length) return { ok: false, errorKey: "collab.errors.not_found", id: null };
    refresh(`/briefs/${briefId}`);
    return { ok: true, errorKey: null, id: briefId };
  }

  const { data, error } = await admin
    .from("briefs")
    .insert({ ...row, company_id: profile.id, status: "draft" })
    .select("id")
    .single();
  if (error || !data) {
    log.error("brief.insert_failed", { error });
    return { ok: false, errorKey: "ui.errors.generic", id: null };
  }
  refresh();
  return { ok: true, errorKey: null, id: data.id };
}

/** Publish a draft. Requires complete company details, like a Discover offer. */
export async function publishBrief(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const briefId = id(fd, "brief_id");
  if (!briefId) return fail("ui.errors.invalid");
  if (!companyDetailsComplete(profile)) return fail("collab.errors.company_details");
  const { data, error } = await createAdminClient()
    .from("briefs")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .eq("company_id", profile.id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    log.error("brief.publish_failed", { brief_id: briefId, error });
    return fail("ui.errors.generic");
  }
  if (!data?.length) return fail("collab.errors.invalid_state");
  refresh(`/briefs/${briefId}`);
  return OK;
}

/** Archive a brief: it leaves the creators' list; existing invitations stay. */
export async function archiveBrief(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const briefId = id(fd, "brief_id");
  if (!briefId) return fail("ui.errors.invalid");
  const { data, error } = await createAdminClient()
    .from("briefs")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .eq("company_id", profile.id)
    .neq("status", "archived")
    .select("id");
  if (error) {
    log.error("brief.archive_failed", { brief_id: briefId, error });
    return fail("ui.errors.generic");
  }
  if (!data?.length) return fail("collab.errors.invalid_state");
  refresh(`/briefs/${briefId}`);
  return OK;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function inviteCreator(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const briefId = id(fd, "brief_id");
  const creatorId = id(fd, "creator_id");
  if (!briefId || !creatorId) return fail("ui.errors.invalid");
  const amount = parseAmount(fd.get("amount"));
  if (!amount.ok) return fail("collab.errors.amount");
  const raw = str(fd, "message").trim();
  if (!raw || raw.length > LIMITS.message) return fail("collab.errors.message");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const message = (await cleanText(profile.id, raw)) ?? raw;
  const r = await transition("collab_create_invitation", () =>
    createAdminClient().rpc("collab_create_invitation", {
      p_company: profile.id, p_brief: briefId, p_creator: creatorId, p_message: message, p_amount: amount.value,
    }),
  );
  if (!r.ok) return r.result;
  refresh(`/briefs/${briefId}`);
  return OK;
}

export async function withdrawInvitation(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const invitationId = id(fd, "invitation_id");
  if (!invitationId) return fail("ui.errors.invalid");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const r = await transition("collab_withdraw_invitation", () =>
    createAdminClient().rpc("collab_withdraw_invitation", { p_company: profile.id, p_invitation: invitationId }),
  );
  if (!r.ok) return r.result;
  refresh();
  return OK;
}

export async function reviseInvitation(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const invitationId = id(fd, "invitation_id");
  if (!invitationId) return fail("ui.errors.invalid");
  const amount = parseAmount(fd.get("amount"));
  if (!amount.ok) return fail("collab.errors.amount");
  const raw = str(fd, "message").trim();
  if (!raw || raw.length > LIMITS.message) return fail("collab.errors.message");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const message = (await cleanText(profile.id, raw)) ?? raw;
  const r = await transition("collab_revise_invitation", () =>
    createAdminClient().rpc("collab_revise_invitation", {
      p_company: profile.id, p_invitation: invitationId, p_message: message, p_amount: amount.value,
    }),
  );
  if (!r.ok) return r.result;
  refresh();
  return OK;
}

/** Creator: accept, decline or ask for changes. Accepting opens the collaboration and its deal room. */
export async function respondToInvitation(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const invitationId = id(fd, "invitation_id");
  const response = str(fd, "response");
  if (!invitationId || !["accept", "decline", "request_changes"].includes(response)) return fail("ui.errors.invalid");
  const rawNote = str(fd, "note").trim();
  if (rawNote.length > LIMITS.note) return fail("collab.errors.note");
  if (response === "request_changes" && !rawNote) return fail("collab.errors.note_required");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const note = await cleanText(profile.id, rawNote);
  const r = await transition("collab_respond_invitation", () =>
    createAdminClient().rpc("collab_respond_invitation", {
      p_creator: profile.id, p_invitation: invitationId, p_response: response, p_note: note,
    }),
  );
  if (!r.ok) return r.result;
  refresh("/inbox");
  return OK;
}

// ---------------------------------------------------------------------------
// Collaboration: terms, deliverables, completion
// ---------------------------------------------------------------------------

async function party() {
  const profile = await requireProfile();
  if (profile.role !== "creator" && profile.role !== "company") return null;
  return profile;
}

export async function proposeTerms(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await party();
  if (!profile) return fail("collab.errors.not_allowed");
  const collabId = id(fd, "collaboration_id");
  if (!collabId) return fail("ui.errors.invalid");
  const amount = parseAmount(fd.get("amount"), { required: true });
  if (!amount.ok) return fail("collab.errors.amount");
  const rawTerms = str(fd, "terms").trim();
  if (rawTerms.length < LIMITS.terms[0] || rawTerms.length > LIMITS.terms[1]) return fail("collab.errors.terms");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const terms = (await cleanText(profile.id, rawTerms)) ?? rawTerms;
  const r = await transition("collab_propose_terms", () =>
    createAdminClient().rpc("collab_propose_terms", {
      p_actor: profile.id, p_collab: collabId, p_amount: amount.value as number, p_terms: terms,
    }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

export async function confirmTerms(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await party();
  if (!profile) return fail("collab.errors.not_allowed");
  const collabId = id(fd, "collaboration_id");
  if (!collabId) return fail("ui.errors.invalid");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const r = await transition("collab_confirm_terms", () =>
    createAdminClient().rpc("collab_confirm_terms", { p_actor: profile.id, p_collab: collabId }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`, "/inbox");
  return OK;
}

export async function addDeliverable(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const collabId = id(fd, "collaboration_id");
  if (!collabId) return fail("ui.errors.invalid");
  const rawTitle = str(fd, "title").trim();
  if (rawTitle.length < LIMITS.deliverableTitle[0] || rawTitle.length > LIMITS.deliverableTitle[1]) {
    return fail("collab.errors.deliverable_title");
  }
  const rawDescription = str(fd, "description").trim();
  if (rawDescription.length > LIMITS.note) return fail("collab.errors.note");
  const due = parseDay(fd.get("due_date"));
  if (!due.ok) return fail("collab.errors.date");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const title = (await cleanText(profile.id, rawTitle)) ?? rawTitle;
  const description = await cleanText(profile.id, rawDescription);
  const r = await transition("collab_add_deliverable", () =>
    createAdminClient().rpc("collab_add_deliverable", {
      p_company: profile.id, p_collab: collabId, p_title: title, p_description: description, p_due: due.value,
    }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

export async function removeDeliverable(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const deliverableId = id(fd, "deliverable_id");
  const collabId = id(fd, "collaboration_id");
  if (!deliverableId || !collabId) return fail("ui.errors.invalid");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const r = await transition("collab_remove_deliverable", () =>
    createAdminClient().rpc("collab_remove_deliverable", { p_company: profile.id, p_deliverable: deliverableId }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

/** Only https links are accepted as a submission URL; anything else is refused, not rewritten. */
function httpsUrl(raw: string): string | null | false {
  const s = raw.trim();
  if (!s) return null;
  if (s.length > 500) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : false;
  } catch {
    return false;
  }
}

export async function submitDeliverable(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator");
  const deliverableId = id(fd, "deliverable_id");
  const collabId = id(fd, "collaboration_id");
  if (!deliverableId || !collabId) return fail("ui.errors.invalid");
  const url = httpsUrl(str(fd, "url"));
  if (url === false) return fail("collab.errors.url");
  const rawNote = str(fd, "note").trim();
  if (rawNote.length > LIMITS.note) return fail("collab.errors.note");
  if (!url && !rawNote) return fail("collab.errors.submission_empty");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const note = await cleanText(profile.id, rawNote);
  const r = await transition("collab_submit_deliverable", () =>
    createAdminClient().rpc("collab_submit_deliverable", {
      p_creator: profile.id, p_deliverable: deliverableId, p_url: url, p_note: note,
    }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

export async function reviewDeliverable(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const deliverableId = id(fd, "deliverable_id");
  const collabId = id(fd, "collaboration_id");
  const decision = str(fd, "decision");
  if (!deliverableId || !collabId || !["approve", "revise"].includes(decision)) return fail("ui.errors.invalid");
  const rawNote = str(fd, "note").trim();
  if (rawNote.length > LIMITS.note) return fail("collab.errors.note");
  if (decision === "revise" && !rawNote) return fail("collab.errors.note_required");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const note = await cleanText(profile.id, rawNote);
  const r = await transition("collab_review_deliverable", () =>
    createAdminClient().rpc("collab_review_deliverable", {
      p_company: profile.id, p_deliverable: deliverableId, p_decision: decision, p_note: note,
    }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

export async function completeCollaboration(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const collabId = id(fd, "collaboration_id");
  if (!collabId) return fail("ui.errors.invalid");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const r = await transition("collab_complete", () =>
    createAdminClient().rpc("collab_complete", { p_company: profile.id, p_collab: collabId }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}

export async function cancelCollaboration(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await party();
  if (!profile) return fail("collab.errors.not_allowed");
  const collabId = id(fd, "collaboration_id");
  if (!collabId) return fail("ui.errors.invalid");
  const rawReason = str(fd, "reason").trim();
  if (rawReason.length < LIMITS.reason[0] || rawReason.length > LIMITS.reason[1]) return fail("collab.errors.reason");
  const blocked = (await consumeRateLimit("collab_write", profile.id)).allowed ? null : fail("collab.errors.rate_limited");
  if (blocked) return blocked;
  const reason = (await cleanText(profile.id, rawReason)) ?? rawReason;
  const r = await transition("collab_cancel", () =>
    createAdminClient().rpc("collab_cancel", { p_actor: profile.id, p_collab: collabId, p_reason: reason }),
  );
  if (!r.ok) return r.result;
  refresh(`/collaborations/${collabId}`);
  return OK;
}
