/**
 * Masking utility — the three rules (regexes and labels) are ported faithfully
 * from the reference implementation in CLAUDE.md §6.1. How they are applied is
 * not: see maskSensitiveData for why overlapping matches are merged instead of
 * replaced one rule after another.
 *
 * MUST be run server-side before a message is persisted, so raw contact info
 * never touches the database or a company's client (§6, §12).
 */

// Built per call rather than hoisted to module scope: these are /g regexes and
// the scan below drives their `lastIndex`, so shared instances would carry one
// call's position into the next. (The spec's reference version gets this right
// by declaring them inside the function; this keeps that property explicit.)
function patterns() {
  return {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    // Includes the Egyptian mobile pattern (01[0125]XXXXXXXX) — MENA is a
    // primary market, so keep this even when generalizing (§6.1).
    phone:
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b01[0125]\d{8}\b/g,
    social: /(telegram|wa\.me|whatsapp|discord\.gg|t\.me)\/[a-zA-Z0-9_]+/gi,
  };
}

export type MaskMatch = "email" | "phone" | "social";

export type MaskResult = {
  maskedText: string;
  isMasked: boolean;
  /**
   * Which rules fired. §6 requires logging this (redacted) for admin review,
   * because an attempt to move a deal off-platform is a permanent-ban event.
   */
  matched: MaskMatch[];
};

const LABEL: Record<MaskMatch, string> = {
  email: "[locked: email hidden by platform policy]",
  phone: "[locked: phone hidden by platform policy]",
  social: "[locked: external link hidden]",
};

// Order the audit log reports categories in. Not the masking order — there
// isn't one any more (see below).
const RULES: readonly MaskMatch[] = ["email", "phone", "social"];

// When matches overlap, the merged span takes the first label here: a
// `wa.me/2010…` link is an off-platform link that happens to contain a phone
// number, so it reads as a link, not as `wa.me/[locked: phone …]`.
const LABEL_PRECEDENCE: readonly MaskMatch[] = ["social", "email", "phone"];

type Span = { start: number; end: number; kinds: Set<MaskMatch> };

export function maskSensitiveData(text: string): MaskResult {
  const p = patterns();

  // Every rule runs against the ORIGINAL text, and overlapping matches are
  // merged before anything is replaced. The spec's reference version chains
  // .replace() calls instead, and any fixed chain order leaks: the first rule
  // truncates a match the next would have made. Email→phone→social left
  // `wa.me/` and the `/abc123` of `info@discord.gg/abc123` behind; simply
  // moving social first leaks `234 5678` out of `whatsapp/0101 234 5678`.
  //
  // Each rule is also tried at every start position rather than scanned
  // leftmost-non-overlapping, because a rule can hide its own next match: in
  // `t.me/discord.gg/abc123` the link match `t.me/discord` swallows the start
  // of `discord.gg/abc123`, and a non-overlapping scan resumes past it with
  // the invite code still in clear. Inputs are capped (4k chat, 20k offer
  // text), and this costs no more than the patterns' own worst case already
  // does on those sizes.
  const found: Span[] = [];
  for (const kind of RULES) {
    const re = p[kind];
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      found.push({ start: m.index, end: m.index + m[0].length, kinds: new Set([kind]) });
      re.lastIndex = m.index + 1;
    }
  }

  // Unlike the spec's short-circuiting `||`, every rule is evaluated so the
  // admin audit log can record *all* the categories that fired.
  const matched = RULES.filter((kind) => found.some((s) => s.kinds.has(kind)));
  if (found.length === 0) return { maskedText: text, isMasked: false, matched };

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const span of found) {
    const last = merged.at(-1);
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      for (const kind of span.kinds) last.kinds.add(kind);
    } else {
      merged.push(span);
    }
  }

  let maskedText = "";
  let cursor = 0;
  for (const span of merged) {
    const kind = LABEL_PRECEDENCE.find((k) => span.kinds.has(k))!;
    maskedText += text.slice(cursor, span.start) + LABEL[kind];
    cursor = span.end;
  }
  maskedText += text.slice(cursor);

  return { maskedText, isMasked: true, matched };
}
