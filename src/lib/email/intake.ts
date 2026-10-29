import "server-only";

import { evaluateOffer } from "@/lib/ai/evaluate";
import type { EvaluationResult } from "@/lib/ai/types";
import { screenInboundEmail } from "@/lib/ai/spam-filter";
import { EMPTY_BODY_DETAIL } from "./held";
import { ACCEPTED_INBOUND_DOMAINS } from "@/lib/alias";
import { maskSensitiveData } from "@/lib/mask";
import { runSecurityCheck } from "@/lib/security/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/supabase/like";
import { notifyNewDeal } from "@/lib/whatsapp";
import { log } from "@/lib/log";
import type { CountryShare, SponsorshipType } from "@/lib/types/database";
import {
  buildOfferText,
  extractOfferedAmount,
  findInboundAlias,
  inferSponsorshipType,
  mergeReceivedEmail,
  summarizeAttachments,
  type NormalizedEmail,
} from "./parse";
import { fetchReceivedEmail } from "./received";
import {
  CONTENT_FETCH_PERMANENT_PREFIX,
  CONTENT_FETCH_RETRYABLE_PREFIX,
  claimDelivery,
} from "./claim";

/**
 * The §5 intake pipeline, steps 3–5.
 *
 * Runs entirely as service_role. That is not a shortcut: the row it writes has
 * no authenticated user behind it (a company sending mail is not a Green Light
 * account), and it sets ai_evaluation and offered_amount, which RLS withholds
 * from `authenticated` precisely so the rated party cannot write their own
 * rating.
 */

export type IntakeOutcome = {
  status: "processed" | "unknown_alias" | "rejected" | "failed";
  detail: string;
  chatId?: string;
  creatorId?: string;
  /** Screener score, when the delivery got far enough to be screened. */
  spamScore?: number;
  spamReasons?: string[];
};

/** Opening summary posted into the room, from the platform rather than a user. */
function summaryMessage(
  evaluation: EvaluationResult,
  offered: number | null,
  attachments: string,
): string {
  const lines = [
    `Deal Co-Pilot — ${evaluation.risk.toUpperCase()}`,
    "",
    offered !== null
      ? `They offered roughly $${offered.toLocaleString("en-US")}.`
      : "No amount was stated in the message.",
    `Recommended: $${evaluation.recommended_price_usd.toLocaleString("en-US")} (fair range $${evaluation.price_range_usd.low.toLocaleString("en-US")}–$${evaluation.price_range_usd.high.toLocaleString("en-US")}).`,
    "",
    evaluation.reasoning,
  ];

  if (evaluation.risk_capped) {
    lines.push(
      "",
      "Held at yellow: this is a high-value deal and your audience geography is self-reported. Connect platform analytics to lift the cap.",
    );
  }

  if (evaluation.engine === "heuristic") {
    lines.push(
      "",
      "(Rule-based estimate — the AI engine could not be reached, so this is arithmetic on your reach and category rather than an AI reading of the offer.)",
    );
  }

  if (attachments) {
    lines.push("", "Attachments on the original email:", attachments);
  }

  return lines.join("\n");
}

const CREATOR_COLUMNS =
  "id, role, banned_at, subscription_plan, whatsapp_number, whatsapp_notifications_enabled";

// Mirrors CREATOR_COLUMNS above. Nullability matches public.profiles: the
// WhatsApp flag is NOT NULL with a default, the rest are nullable.
type AliasMatch = {
  id: string;
  role: string | null;
  banned_at: string | null;
  subscription_plan: string | null;
  whatsapp_number: string | null;
  whatsapp_notifications_enabled: boolean;
};

/**
 * The creator an alias belongs to, current alias first.
 *
 * Escaped on both columns: the alias is read off a sender-controlled header,
 * and an unescaped `%` there would match somebody else's alias entirely.
 */
async function findCreatorByAlias(
  admin: ReturnType<typeof createAdminClient>,
  alias: string,
): Promise<AliasMatch | null> {
  const pattern = escapeLikePattern(alias);

  const { data: current } = await admin
    .from("profiles")
    .select(CREATOR_COLUMNS)
    .ilike("inbound_alias", pattern)
    .maybeSingle();
  if (current) return current as AliasMatch;

  const { data: previous } = await admin
    .from("profiles")
    .select(CREATOR_COLUMNS)
    .ilike("previous_inbound_alias", pattern)
    .maybeSingle();
  return (previous as AliasMatch | null) ?? null;
}

export type IntakeDeps = {
  /** Injected so the content fetch can be stubbed; defaults to Resend. */
  fetchContent?: typeof fetchReceivedEmail;
};

/**
 * Process one inbound delivery.
 *
 * `meta` is the webhook's metadata (normalizeInboundEmail). The body and
 * headers are not in it — Resend's webhook never carries them — and are
 * fetched from the Received Emails API below, once the delivery is claimed and
 * the alias resolves to a creator.
 *
 * Idempotency is claimed *first*, by inserting into inbound_emails on
 * Resend's email_id (claim.ts). A unique-violation there means a retry of
 * something already handled, and the whole delivery is a no-op — which is
 * what stops a provider retry minting a second room and a second paid AI call.
 * The one exception is a delivery that stopped at a retryable content-fetch
 * failure: the retry takes it over and finishes it.
 */
export async function processInboundEmail(
  meta: NormalizedEmail,
  deps: IntakeDeps = {},
): Promise<IntakeOutcome> {
  const admin = createAdminClient();
  let email = meta;

  if (!email.providerMessageId) {
    return { status: "rejected", detail: "delivery carried no email id" };
  }

  const alias = findInboundAlias(email.to, ACCEPTED_INBOUND_DOMAINS);
  const key = email.providerMessageId;

  // Claim the delivery before doing any work.
  const claim = await claimDelivery({
    async insertClaim() {
      const { error } = await admin.from("inbound_emails").insert({
        provider_message_id: key,
        to_alias: alias,
        sender_email: email.from,
        // Subject only — never the body (see the table comment in 0008). A
        // screener refusal leaves no deal room and no stored message, so
        // without this the audit row cannot answer "which offer did the
        // filter eat?".
        subject: email.subject ? email.subject.slice(0, 300) : null,
        status: "failed",
        detail: "processing",
      });
      return { errorCode: error?.code ?? null, errorMessage: error?.message ?? null };
    },
    async reclaimAfterFetchFailure() {
      const { data, error } = await admin
        .from("inbound_emails")
        .update({ detail: "processing" })
        .eq("provider_message_id", key)
        .eq("status", "failed")
        .like("detail", `${CONTENT_FETCH_RETRYABLE_PREFIX}%`)
        .select("id");
      return !error && (data?.length ?? 0) === 1;
    },
  });

  if (claim.kind === "duplicate") {
    return { status: "processed", detail: "duplicate delivery ignored" };
  }
  if (claim.kind === "error") {
    return { status: "failed", detail: `could not record delivery: ${claim.message}` };
  }

  const finish = async (outcome: IntakeOutcome): Promise<IntakeOutcome> => {
    await admin
      .from("inbound_emails")
      .update({
        status: outcome.status,
        detail: outcome.detail,
        creator_id: outcome.creatorId ?? null,
        chat_id: outcome.chatId ?? null,
        spam_score: outcome.spamScore ?? null,
        spam_reasons: outcome.spamReasons ?? null,
      })
      .eq("provider_message_id", key);
    return outcome;
  };

  if (!email.from) {
    return finish({ status: "rejected", detail: "no usable sender address" });
  }
  // Pinned to the webhook's sender, which claimed the row and is what every
  // later step (threading, WHOIS, the room's sender) keys on.
  const sender: string = email.from;
  if (!alias) {
    return finish({
      status: "rejected",
      detail: `no recipient on an accepted inbound domain (${ACCEPTED_INBOUND_DOMAINS.join(", ")})`,
    });
  }

  // §5.4: identify the creator by the alias — the one they hold now, or the
  // one they were issued before a rotation and still have in their Gmail
  // forwarding rule.
  //
  // Two queries rather than one .or(): a PostgREST filter string is parsed,
  // and the alias comes off a sender-controlled header that may legally
  // contain a comma or a parenthesis. The second query only runs for a
  // delivery the current column did not match.
  const creator = await findCreatorByAlias(admin, alias);

  if (!creator) {
    return finish({ status: "unknown_alias", detail: `alias ${alias} matched no account` });
  }
  if (creator.role !== "creator") {
    return finish({ status: "rejected", detail: "alias belongs to a non-creator account" });
  }
  if (creator.banned_at) {
    return finish({
      status: "rejected",
      detail: "account is suspended",
      creatorId: creator.id,
    });
  }

  // §5.3: the webhook carries metadata only. Fetched here — after the alias
  // resolved to an active creator, so mail for nobody costs no API call, and
  // before the screener, which needs the real headers and body.
  const fetched = await (deps.fetchContent ?? fetchReceivedEmail)(key);
  if (!fetched.ok) {
    // Status code and reason only: never the provider's response body.
    log.warn("inbound.content_fetch_failed", {
      retryable: fetched.retryable,
      reason: fetched.reason,
      status: fetched.status,
      attempts: fetched.attempts,
    });
    return finish(
      fetched.retryable
        ? {
            // "failed" makes the route answer 5xx so the provider redelivers,
            // and the prefix is what lets that redelivery reclaim this row.
            status: "failed",
            detail: `${CONTENT_FETCH_RETRYABLE_PREFIX} ${fetched.reason}`,
            creatorId: creator.id,
          }
        : {
            status: "rejected",
            detail: `${CONTENT_FETCH_PERMANENT_PREFIX} ${fetched.reason}`,
            creatorId: creator.id,
          },
    );
  }
  email = mergeReceivedEmail(meta, fetched.email);

  const offerText = buildOfferText(email);
  if (!offerText) {
    return finish({
      status: "rejected",
      // Shared with held.ts, which allowlists on it to show this to the creator.
      detail: EMPTY_BODY_DETAIL,
      creatorId: creator.id,
    });
  }

  // The screen runs here, before anything is spent and before any of the
  // message is written anywhere: an evaluation, a WHOIS lookup, a Safe
  // Browsing call and a WhatsApp alert all hang off the branch below, and a
  // newsletter should cost none of them.
  //
  // `offerText` rather than the raw body so the screener reads what the
  // evaluator would — subject line and any text attachment included, which is
  // where a rate card's sponsorship wording often is.
  const screen = screenInboundEmail({
    subject: email.subject,
    bodyText: offerText,
    from: sender,
    headers: email.headers,
  });

  if (screen.verdict === "reject") {
    // Nothing is created: no deal room, no message row, no violation log.
    // What remains is this audit row — sender, alias, subject, score and the
    // rules that fired — which is what makes a false positive recoverable
    // instead of a mystery. See 0021's comment for why the subject is kept.
    return finish({
      status: "rejected",
      detail: `screened out: ${screen.reasons.join("; ") || "no sponsorship signal"}`,
      creatorId: creator.id,
      spamScore: screen.score,
      spamReasons: screen.reasons,
    });
  }

  const sponsorshipType: SponsorshipType = inferSponsorshipType(offerText);
  const offered = extractOfferedAmount(offerText);

  // An existing open thread with this sender is a continuing negotiation, not
  // a new deal. 'paid' is excluded: a settled deal is closed, and a later mail
  // from the same sponsor is a fresh offer.
  const { data: existing } = await admin
    .from("deal_chats")
    .select("id, deal_status")
    .eq("creator_id", creator.id)
    .ilike("sender_email", escapeLikePattern(sender))
    .neq("deal_status", "paid")
    .order("created_at", { ascending: false })
    .limit(1);

  const openChat = existing?.[0] ?? null;

  // §6: mask before anything is persisted. An inbound offer is exactly where a
  // sponsor's direct WhatsApp arrives, and it must not reach the database raw.
  const masked = maskSensitiveData(
    [email.subject, offerText].filter(Boolean).join("\n\n"),
  );

  let chatId: string;

  if (openChat) {
    chatId = openChat.id;
  } else {
    // Build the §7.4 payload from the creator's strongest media kit.
    const { data: kits } = await admin
      .from("media_kits")
      .select("*")
      .eq("creator_id", creator.id)
      .order("avg_views", { ascending: false })
      .limit(1);

    const kit = kits?.[0];
    const audienceVerified = kit?.audience_verified === true;

    // Priced, security-checked and spam-classified independently — none of
    // the three should delay or block another, and a failure in the security
    // check (or a hiccup in the classifier, which never throws) must never
    // stop a real offer from becoming a deal room.
    const [evaluation, security] = await Promise.all([
      evaluateOffer({
        avg_views: kit?.avg_views ?? null,
        avg_ccv: kit?.avg_ccv ?? null,
        engagement_rate: kit?.engagement_rate ?? null,
        content_category: kit?.content_category ?? null,
        content_language: kit?.content_language ?? null,
        declared_top_countries: (kit?.declared_top_countries as CountryShare[] | null) ?? null,
        // Never pass verified geography through unless the row actually says so.
        verified_top_countries: audienceVerified
          ? ((kit?.verified_top_countries as CountryShare[] | null) ?? null)
          : null,
        audience_verified: audienceVerified,
        sponsorship_type: sponsorshipType,
        target_countries: null, // an emailed offer rarely states them
        offer_text: offerText,
      }),
      runSecurityCheck(sender, offerText).catch(() => null),
    ]);


    const { data: chat, error: chatError } = await admin
      .from("deal_chats")
      .insert({
        creator_id: creator.id,
        company_id: null, // the sender has no platform account
        sender_email: sender,
        deal_status: "new",
        offered_amount: offered,
        recommended_price_usd: evaluation.recommended_price_usd,
        ai_evaluation: evaluation.risk,
        sponsorship_type: sponsorshipType,
        target_countries: null,
        security_check: security,
        is_likely_sponsorship: screen.verdict === "accept",
      })
      .select("id")
      .single();

    if (chatError || !chat) {
      return finish({
        status: "failed",
        detail: `could not create deal room: ${chatError?.message ?? "unknown"}`,
        creatorId: creator.id,
        spamScore: screen.score,
        spamReasons: screen.reasons,
      });
    }

    chatId = chat.id;

    notifyNewDeal(
      creator,
      offered !== null
        ? `New offer from ${sender} — $${offered.toLocaleString("en-US")}.`
        : `New offer from ${sender}.`,
    );

    // The opening summary, posted by the platform. sender_id is null because
    // no user wrote it — the room renders that as a system message.
    await admin.from("messages").insert({
      chat_id: chatId,
      sender_id: null,
      message_text: summaryMessage(
        evaluation,
        offered,
        summarizeAttachments(email.attachments),
      ),
      is_masked: false,
    });
  }

  // The offer itself, masked, attributed to the sender rather than a user.
  const { data: inserted, error: messageError } = await admin
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: null,
      message_text: masked.maskedText,
      is_masked: masked.isMasked,
    })
    .select("id")
    .single();

  if (messageError) {
    return finish({
      status: "failed",
      detail: `could not store the message: ${messageError.message}`,
      creatorId: creator.id,
      chatId,
      spamScore: screen.score,
      spamReasons: screen.reasons,
    });
  }

  // §6 wants the record even when the contact details were the sender's, not
  // the creator's — the log is attributed to the creator whose room it entered,
  // and the excerpt is the already-masked text.
  if (masked.isMasked) {
    await admin.from("violation_logs").insert({
      profile_id: creator.id,
      chat_id: chatId,
      message_id: inserted.id,
      matched_rules: masked.matched,
      redacted_excerpt: `[inbound email from ${sender}] ${masked.maskedText.slice(0, 400)}`,
    });
  }

  return finish({
    status: "processed",
    detail: openChat
      ? "appended to an open deal room"
      : `created a deal room${screen.verdict === "flag" ? " (flagged as possible spam)" : ""}`,
    creatorId: creator.id,
    chatId,
    spamScore: screen.score,
    spamReasons: screen.reasons,
  });
}
