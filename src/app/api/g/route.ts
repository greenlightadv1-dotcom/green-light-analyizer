import { NextResponse } from "next/server";
import { AiUnavailableError, chatJson } from "@/lib/ai/chat";
import { log } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { G_ACTIONS, allowedActions, type GAction, type GActionId } from "@/lib/g/actions";
import { collabContext, companyContext, creatorContext, loadGSession, type CollabGData } from "@/lib/g/context";
import { briefFromText } from "@/lib/g/brief-text";
import { allowedProposals, proposalText, proposalTypesFor, type GProposal, type ProposalScope } from "@/lib/g/collab";
import {
  buildPrompt,
  detectIntents,
  maskTurns,
  parseGRequest,
  ungroundedFigures,
  validateModelReply,
  type Intent,
} from "@/lib/g/conversation";

/**
 * G — the assistant endpoint (feature 7).
 *
 * POST { message, history, locale, page, brief?, compare? } →
 *   { engine, reply, intents, cards, actions }
 *
 * - Identity and role come from the session only (loadGSession). The body's
 *   fields are request data; none of them selects whose data is read.
 * - Every structured card is computed from the caller's own authorized data,
 *   with provenance on every metric. They are the source of truth; the model
 *   only words an explanation of them.
 * - If the model is unavailable, misconfigured, slow or returns anything
 *   malformed, the answer is the same cards with no prose (engine "rules").
 * - The model's suggested actions pass through allowedActions: known ids,
 *   this role's pages, and parameters from this user's own context only.
 * - Proposals (lib/g/collab.ts) are prepared forms, never executed here:
 *   allowedProposals keeps only ids from this user's own context, masks the
 *   text, and a proposal stating a figure G was not given is dropped. The
 *   user reviews, edits and confirms each one; only then does the client call
 *   the product's ordinary server action, which re-checks everything.
 * - Nothing is stored. The conversation stays in the user's tab.
 */
export const maxDuration = 60;

const MAX_BODY = 24_000;
const MODEL_BUDGET_MS = 25_000;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const session = await loadGSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const { profile } = session;

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

  const limit = await consumeRateLimit("g_chat", profile.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: limit.message, retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const intents: Intent[] = detectIntents(req.message, profile.role, req.page);
  // Company creator search in plain words: criteria the message states become
  // part of the brief (the structured brief still wins), and a message that
  // states any criterion is a search even without the word "recommend".
  const fromText = profile.role === "company" ? briefFromText(req.message) : { brief: {}, understood: [] as string[] };
  if (fromText.understood.length && !intents.includes("recommend")) {
    intents.splice(intents.indexOf("help") >= 0 ? intents.indexOf("help") : intents.length, intents.includes("help") ? 1 : 0, "recommend");
  }
  const roleActions = (Object.keys(G_ACTIONS) as GActionId[]).filter((a) =>
    G_ACTIONS[a].roles.includes(profile.role),
  );

  let cards: Record<string, unknown> = {};
  let modelData: Record<string, unknown> = { intents };
  let defaults: GAction[] = [];
  let scope = {
    role: profile.role,
    dealIds: new Set<string>(),
    creatorIds: new Set<string>(),
    briefIds: new Set<string>(),
    collaborationIds: new Set<string>(),
  };
  let proposalScope: ProposalScope = {
    role: profile.role,
    publishedBriefIds: new Set(),
    creatorIds: new Set(),
    invited: new Set(),
    collaborationIds: new Set(),
  };
  let creatorNames = new Map<string, string>();
  const wantsCollab = intents.includes("collab") || intents.includes("content") || intents.includes("help");
  const collabData = (c: CollabGData) => ({
    collaborations: c.collaborations,
    invitations: c.invitations,
    briefs: c.briefs,
    ...(c.content ? { content: c.content } : {}),
  });

  try {
    if (profile.role === "creator") {
      const [ctx, collab] = await Promise.all([creatorContext(profile), collabContext(profile)]);
      scope = { ...scope, dealIds: ctx.dealIds, collaborationIds: collab.collaborationIds };
      proposalScope = { ...proposalScope, collaborationIds: collab.collaborationIds };
      if (intents.includes("collab")) cards.collaborations = { items: collab.collaborations, invitations: collab.invitations };
      if (intents.includes("content") && collab.content) cards.content = collab.content;
      if (intents.includes("assessment") || intents.includes("help")) cards.assessment = ctx.assessment;
      if (intents.includes("deals")) cards.deals = { summary: ctx.assessment.deals, recent: ctx.recentDeals };
      modelData = {
        intents,
        assessment: ctx.assessment,
        deals: { summary: ctx.assessment.deals, recent: ctx.recentDeals },
        ...(wantsCollab ? collabData(collab) : {}),
      };
      defaults = intents.includes("content")
        ? [{ action: "open_content" }]
        : intents.includes("collab")
          ? [{ action: "open_collaborations" }, { action: "open_opportunities" }]
          : ctx.assessment.nextActions.map((action) => ({ action }));
    } else if (profile.role === "company") {
      const [ctx, collab] = await Promise.all([companyContext(profile, req.brief, req.compare, fromText.brief), collabContext(profile)]);
      scope = { ...scope, dealIds: ctx.dealIds, creatorIds: ctx.creatorIds, briefIds: collab.briefIds, collaborationIds: collab.collaborationIds };
      creatorNames = ctx.creatorNames;
      proposalScope = {
        ...proposalScope,
        publishedBriefIds: collab.publishedBriefIds,
        creatorIds: ctx.creatorIds,
        invited: collab.invited,
        collaborationIds: collab.collaborationIds,
      };
      if (intents.includes("collab")) cards.collaborations = { items: collab.collaborations, invitations: [], briefs: collab.briefs };
      if (intents.includes("recommend") || intents.includes("brief") || intents.includes("help")) {
        cards.brief = { value: ctx.brief, missing: ctx.briefMissing, understood: fromText.understood };
        cards.recommendations = { directorySize: ctx.directorySize, items: ctx.recommendations };
      }
      if (intents.includes("compare")) cards.comparison = ctx.comparison;
      if (intents.includes("deals")) cards.deals = { recent: ctx.recentDeals };
      modelData = {
        intents,
        brief: ctx.brief,
        briefMissing: ctx.briefMissing,
        directorySize: ctx.directorySize,
        recommendations: ctx.recommendations,
        comparison: ctx.comparison,
        recentDeals: ctx.recentDeals,
        ...(wantsCollab ? collabData(collab) : {}),
      };
      defaults = intents.includes("collab") ? [{ action: "open_collaborations" }, { action: "open_briefs" }] : [{ action: "open_discover" }];
    } else {
      cards = {};
      modelData = { intents, note: "Admin users get navigation help only." };
      defaults = [{ action: "open_dashboard" }];
    }
  } catch (error) {
    log.error("g.context_failed", { error });
    return NextResponse.json({ error: "context_unavailable" }, { status: 503 });
  }

  let engine: "ai" | "rules" = "rules";
  let reply: string | null = null;
  let actions = allowedActions(defaults, scope);
  let proposals: GProposal[] = [];
  try {
    const result = await chatJson(
      {
        prompt: buildPrompt({
          role: profile.role,
          locale: req.locale,
          page: req.page,
          allowedActions: roleActions,
          proposalTypes: proposalTypesFor(profile.role),
          data: modelData,
          history: maskTurns(req.history),
          message: maskTurns([{ role: "user", text: req.message }])[0].text,
        }),
        temperature: 0.3,
        maxTokens: 1200,
        deadlineAt: Date.now() + MODEL_BUDGET_MS,
      },
      validateModelReply,
    );
    // G never invents numbers: a reply stating a figure absent from what it
    // was given is discarded, and the rule-computed cards answer instead.
    const invented = ungroundedFigures(result.value.reply, [
      JSON.stringify(modelData),
      req.message,
      ...req.history.map((t) => t.text),
      JSON.stringify(req.brief ?? null),
    ]);
    if (invented.length) {
      log.warn("g.reply_ungrounded", { count: invented.length });
      throw new Error("ungrounded figures");
    }
    engine = "ai";
    reply = result.value.reply;
    const fromModel = allowedActions(result.value.actions, scope);
    if (fromModel.length) actions = fromModel;
    const groundingSources = [JSON.stringify(modelData), req.message, ...req.history.map((t) => t.text)];
    proposals = allowedProposals(result.value.proposals, proposalScope).filter((p) => {
      const ok = ungroundedFigures(proposalText(p), groundingSources).length === 0;
      if (!ok) log.warn("g.proposal_ungrounded", { type: p.type });
      return ok;
    }).map((p) => (p.type === "invitation" ? { ...p, creator_name: creatorNames.get(p.creator_id) } : p));
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) log.warn("g.model_reply_rejected", { error });
  }

  return NextResponse.json({ engine, reply, intents, cards, actions, proposals });
}
