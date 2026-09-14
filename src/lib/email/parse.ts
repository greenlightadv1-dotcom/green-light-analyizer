import type { SponsorshipType } from "@/lib/types/database";

/**
 * Inbound email parsing — CLAUDE.md §5.
 *
 * Pure functions only, no I/O, so the whole shape of a delivery can be tested
 * without a webhook or a provider (see parse.test.ts).
 *
 * ⚠️ SCHEMA ASSUMPTION. Resend's inbound payload shape is not pinned here, so
 * every accessor below is deliberately tolerant: `to` may be a string, an array
 * of strings, or an array of objects with `address`/`email`; the event may be
 * wrapped in `data` or not. This is a guess at the envelope, verified against
 * nothing. Before going live, send one real delivery to a request bin, compare
 * it against `normalizeInboundEmail`, and delete this warning.
 */

export type InboundAttachment = {
  filename: string;
  content_type: string;
  size: number | null;
  /** Present for text parts we can read; never used for binary. */
  text: string | null;
};

export type NormalizedEmail = {
  providerMessageId: string | null;
  from: string | null;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  attachments: InboundAttachment[];
};

// --- address helpers --------------------------------------------------------

/** "Brand Team <deals@brand.com>" -> "deals@brand.com" (lowercased). */
export function normalizeAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

/** The display name, if the address carried one. */
export function displayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() || null : null;
}

/** Flattens the several shapes a recipient list arrives in. */
export function collectAddresses(value: unknown): string[] {
  const out: string[] = [];

  const push = (v: unknown) => {
    const addr = normalizeAddress(v);
    if (addr) out.push(addr);
  };

  if (typeof value === "string") {
    // "a@x.com, b@y.com" or a single address, possibly with display names.
    for (const part of value.split(",")) push(part);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(o.address ?? o.email ?? o.value);
      }
    }
  } else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    push(o.address ?? o.email ?? o.value);
  }

  return out;
}

/**
 * Picks the recipient that is one of our aliases (§5.1).
 *
 * A forwarded email routinely carries several recipients — the creator's real
 * address in To, ours in X-Forwarded-To or Cc. Matching on domain is what makes
 * the alias, not position in the list.
 */
export function findInboundAlias(
  recipients: string[],
  inboundDomain: string,
): string | null {
  const domain = `@${inboundDomain.toLowerCase()}`;
  return recipients.find((r) => r.endsWith(domain)) ?? null;
}

// --- content ---------------------------------------------------------------

/** Crude HTML-to-text, for deliveries that carry no text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TEXTUAL = /^text\/|^application\/(json|xml)$/i;
const MAX_ATTACHMENT_TEXT = 5000;

export function normalizeAttachments(value: unknown): InboundAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 20).map((item) => {
    const a = (item ?? {}) as Record<string, unknown>;
    const contentType = String(a.content_type ?? a.contentType ?? "application/octet-stream");

    // Only text-ish parts are read. Binary content is catalogued, never
    // decoded: an unauthenticated endpoint that parses arbitrary attachments
    // is a much larger attack surface than one that lists their names, and
    // storing them needs a Storage bucket and an AV decision that do not exist.
    let text: string | null = null;
    if (TEXTUAL.test(contentType)) {
      const raw = a.content ?? a.text;
      if (typeof raw === "string") {
        const decoded =
          a.encoding === "base64" || /^[A-Za-z0-9+/=\s]+$/.test(raw) === false
            ? raw
            : raw;
        text = decoded.slice(0, MAX_ATTACHMENT_TEXT);
      }
    }

    return {
      filename: String(a.filename ?? a.name ?? "attachment"),
      content_type: contentType,
      size: typeof a.size === "number" ? a.size : null,
      text,
    };
  });
}

/** Strips the quoted history so the evaluator prices the new message. */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,
    /^\s*From:\s.+$/m,
  ];

  let cut = text.length;
  for (const marker of markers) {
    const match = text.match(marker);
    if (match?.index !== undefined && match.index < cut) cut = match.index;
  }

  const trimmed = text.slice(0, cut).trim();
  // A reply that is *only* quoted history still needs to say something.
  return trimmed.length >= 20 ? trimmed : text.trim();
}

const MAX_OFFER_TEXT = 20000;

/**
 * The text handed to evaluateOffer(): the message body plus any readable text
 * attachment, since offers routinely arrive as a rate-card .txt or .csv.
 */
export function buildOfferText(email: NormalizedEmail): string {
  const parts: string[] = [];
  if (email.subject) parts.push(`Subject: ${email.subject}`);
  if (email.text) parts.push(stripQuotedReply(email.text));

  for (const attachment of email.attachments) {
    if (attachment.text) {
      parts.push(`--- ${attachment.filename} ---\n${attachment.text}`);
    }
  }

  return parts.join("\n\n").slice(0, MAX_OFFER_TEXT).trim();
}

/** One line per attachment, for the opening message. Names only. */
export function summarizeAttachments(attachments: InboundAttachment[]): string {
  if (!attachments.length) return "";
  return attachments
    .map((a) => `• ${a.filename} (${a.content_type})`)
    .join("\n");
}

// --- structured fields ------------------------------------------------------

/**
 * Best-effort extraction of what the sponsor offered, for
 * deal_chats.offered_amount (§6.2).
 *
 * Returns null rather than guessing when nothing looks like money — a wrong
 * number here anchors the creator's whole negotiation, so no figure is safer
 * than a plausible-looking wrong one.
 */
export function extractOfferedAmount(text: string): number | null {
  const candidates: number[] = [];

  // $1,200 / USD 1200 / 1200 USD / 1200$ — with optional k suffix.
  const patterns = [
    /(?:\$|usd\s*)\s*([\d,]+(?:\.\d{1,2})?)\s*(k\b)?/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(k\b)?\s*(?:\$|usd\b|dollars?\b)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const n = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) continue;
      const value = match[2] ? n * 1000 : n;
      // Above this it is far more likely a view count or a follower number
      // that happened to sit next to a currency word.
      if (value <= 1_000_000) candidates.push(value);
    }
  }

  if (!candidates.length) return null;
  return Math.max(...candidates);
}

const TYPE_PATTERNS: [SponsorshipType, RegExp][] = [
  ["video_dedicated", /\b(dedicated|full)\s+(video|review)\b|\bdedicated\b/i],
  ["integration", /\b(integration|integrated|segment|60[-\s]?second|mid[-\s]?roll)\b/i],
  ["story_share", /\b(story|stories|status)\s*(share|post|mention)?\b/i],
  ["live_mention", /\b(live|stream)\s*(mention|shout[-\s]?out|read)\b/i],
  ["post", /\b(post|reel|short|tweet|feed)\b/i],
];

/**
 * Guesses the deliverable from the offer text (§6.2 sponsorship_type).
 *
 * Order matters: "dedicated video" and "integration" are checked before the
 * generic "post", which otherwise swallows almost everything. Falls back to
 * 'other', which the creator can correct in the room.
 */
export function inferSponsorshipType(text: string): SponsorshipType {
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return "other";
}

// --- envelope ---------------------------------------------------------------

/** Reads a provider payload into the shape the rest of the pipeline expects. */
export function normalizeInboundEmail(payload: unknown): NormalizedEmail {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = ((root.data ?? root) ?? {}) as Record<string, unknown>;

  const html = typeof data.html === "string" ? data.html : "";
  const plain = typeof data.text === "string" ? data.text : "";

  return {
    providerMessageId:
      (typeof data.message_id === "string" && data.message_id) ||
      (typeof data.email_id === "string" && data.email_id) ||
      (typeof data.id === "string" && data.id) ||
      (typeof root.id === "string" && root.id) ||
      null,
    from: normalizeAddress(data.from),
    fromName: displayName(data.from),
    to: [
      ...collectAddresses(data.to),
      ...collectAddresses(data.cc),
      ...collectAddresses(data.bcc),
    ],
    subject: typeof data.subject === "string" ? data.subject.slice(0, 300) : "",
    text: plain || (html ? htmlToText(html) : ""),
    attachments: normalizeAttachments(data.attachments),
  };
}
