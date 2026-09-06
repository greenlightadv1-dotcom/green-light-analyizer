/**
 * Masking utility — ported faithfully from the reference implementation in
 * CLAUDE.md §6.1.
 *
 * MUST be run server-side before a message is persisted, so raw contact info
 * never touches the database or a company's client (§6, §12).
 */

// Built per call rather than hoisted to module scope: these are /g regexes and
// `.test()` advances `lastIndex`, so shared instances would alternate
// true/false between calls. (The spec's reference version gets this right by
// declaring them inside the function; this keeps that property explicit.)
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

export function maskSensitiveData(text: string): MaskResult {
  const p = patterns();

  // Unlike the spec's short-circuiting `||`, every rule is evaluated so the
  // admin audit log can record *all* the categories that fired.
  const matched: MaskMatch[] = [];
  if (p.email.test(text)) matched.push("email");
  if (p.phone.test(text)) matched.push("phone");
  if (p.social.test(text)) matched.push("social");

  const isMasked = matched.length > 0;
  if (!isMasked) return { maskedText: text, isMasked: false, matched };

  const q = patterns();
  const maskedText = text
    .replace(q.email, "[locked: email hidden by platform policy]")
    .replace(q.phone, "[locked: phone hidden by platform policy]")
    .replace(q.social, "[locked: external link hidden]");

  return { maskedText, isMasked, matched };
}
