/**
 * Pure formatting helpers for outbound relay email (§6).
 *
 * Split from outbound.ts, which imports "server-only" and cannot be loaded by
 * a test runner. Same arrangement as ai/rules.ts against ai/evaluate.ts: the
 * rules that carry a guarantee live where they can be tested directly.
 */

/**
 * Escapes message text for the HTML part of a relayed email.
 *
 * A creator's message is user input on its way into a document rendered by
 * someone else's mail client. Unescaped, `<img src=x onerror=...>` in a reply
 * becomes markup in the company's inbox — and unlike a browser, we have no CSP
 * there and no idea what the client will execute. The ampersand must be
 * replaced first or it would double-escape the entities added after it.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Subject line for a deal thread.
 *
 * Stable across the conversation so a mail client threads the replies, and
 * carrying no creator identity — the company learns nothing from it that the
 * platform has not chosen to tell them.
 */
export function relaySubject(chatId: string): string {
  return `Re: your sponsorship enquiry [${chatId.slice(0, 8)}]`;
}
