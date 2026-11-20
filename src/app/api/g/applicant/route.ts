import { NextResponse } from "next/server";
import { AiUnavailableError, chatJson } from "@/lib/ai/chat";
import { log } from "@/lib/log";
import { maskSensitiveData } from "@/lib/mask";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { createClient } from "@/lib/supabase/server";
import { currentApplication } from "@/lib/verification/application";
import { ownVerification } from "@/lib/verification/server";
import { applicantSummary, buildApplicantPrompt, promisesReviewTime, type ApplicantCaseInput } from "@/lib/g/applicant";
import { maskTurns, parseGRequest, ungroundedFigures } from "@/lib/g/conversation";
import { neutraliseFences } from "@/lib/g/entity";
import type { VerificationCase, VerificationDocType } from "@/lib/types/database";

/**
 * G for people who are not yet approved (Phase 1E): an applicant with no
 * account (identified only by the httpOnly resume cookie, exactly like
 * /apply), or a signed-in account whose status is pending_verification or
 * rejected. Active accounts use /api/g.
 *
 * - Identity comes only from the cookie or the session. The body carries the
 *   question; nothing in it selects whose application is read, and there is
 *   no email, id or lookup parameter at all.
 * - What G sees is applicantSummary's fixed projection of the caller's own
 *   cases: status, which required field and document KEYS are missing, the
 *   reviewer's applicant-facing request or reason, and dates. Internal notes,
 *   fraud flags, second-reviewer state, match keys, reviewer identity and
 *   documents are never read on this path.
 * - Read-only: it cannot submit, change or speed up anything.
 * - A reply that promises a review time, or states a figure not in the data,
 *   is discarded and the computed card answers alone.
 */
export const maxDuration = 60;

const MAX_BODY = 16_000;
const MODEL_BUDGET_MS = 20_000;

type Who = { key: string; stage: "application" | "account"; emailVerified: boolean | null; cases: ApplicantCaseInput[] };

const project = (c: Pick<VerificationCase, "id" | "kind" | "status" | "details" | "info_request" | "decision_reason" | "submitted_at" | "updated_at">, docs: { case_id: string; doc_type: VerificationDocType }[]): ApplicantCaseInput => ({
  kind: c.kind,
  status: c.status,
  details: (c.details as Record<string, string> | null) ?? null,
  documentTypes: docs.filter((d) => d.case_id === c.id).map((d) => d.doc_type),
  info_request: c.info_request,
  decision_reason: c.decision_reason,
  submitted_at: c.submitted_at,
  updated_at: c.updated_at,
});

async function identify(): Promise<{ ok: true; who: Who } | { ok: false; status: 401 | 403 | 503; error: string }> {
  if (!isSupabaseConfigured()) return { ok: false, status: 503, error: "unavailable" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: profile } = await supabase.from("profiles").select("id, account_status, banned_at").eq("id", auth.user.id).maybeSingle();
    if (!profile || profile.banned_at) return { ok: false, status: 403, error: "not_allowed" };
    if (!profile.account_status || profile.account_status === "active") return { ok: false, status: 403, error: "use_g" };
    const own = await ownVerification(profile.id);
    return { ok: true, who: { key: `p:${profile.id}`, stage: "account", emailVerified: null, cases: own.cases.map((c) => project(c, own.documents)) } };
  }
  const app = await currentApplication();
  if (!app) return { ok: false, status: 401, error: "no_application" };
  return {
    ok: true,
    who: { key: `a:${app.request.id}`, stage: "application", emailVerified: Boolean(app.request.email_verified_at), cases: app.cases.map((c) => project(c, app.documents)) },
  };
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const id = await identify();
  if (!id.ok) return NextResponse.json({ error: id.error }, { status: id.status });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = parseGRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const req = parsed.value;

  const limit = await consumeRateLimit("g_applicant", id.who.key);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", message: limit.message, retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  }

  const summary = applicantSummary({ stage: id.who.stage, emailVerified: id.who.emailVerified, cases: id.who.cases });
  const message = maskSensitiveData(req.message).maskedText;
  const history = maskTurns(req.history);

  let engine: "ai" | "rules" = "rules";
  let reply: string | null = null;
  try {
    const result = await chatJson(
      {
        prompt: buildApplicantPrompt({ locale: req.locale, data: summary, history, message, neutralise: neutraliseFences }),
        temperature: 0.2,
        maxTokens: 500,
        deadlineAt: Date.now() + MODEL_BUDGET_MS,
      },
      (raw) => {
        const r = raw as Record<string, unknown> | null;
        if (!r || typeof r.reply !== "string" || !r.reply.trim()) throw new Error("no reply");
        return maskSensitiveData(r.reply.trim().slice(0, 1_500)).maskedText;
      },
    );
    if (promisesReviewTime(result.value)) {
      log.warn("g.applicant_review_time_promised", {});
      throw new Error("review time promised");
    }
    if (ungroundedFigures(result.value, [JSON.stringify(summary), message, ...history.map((t) => t.text)]).length) {
      log.warn("g.reply_ungrounded", { path: "applicant" });
      throw new Error("ungrounded figures");
    }
    engine = "ai";
    reply = result.value;
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) log.warn("g.model_reply_rejected", { path: "applicant", error });
  }

  return NextResponse.json({ engine, reply, cards: { application: summary } });
}
