import "server-only";

import { createClient } from "@/lib/supabase/server";
import { extractDomain } from "@/lib/security/check";

/**
 * "Company & Domain Intelligence" for the Deal Room — the part of it that
 * isn't the existing WHOIS/Safe Browsing/trust-score check (see
 * lib/security/check.ts, cached on deal_chats.security_check by migration
 * 0017). This module answers the other half: "have I dealt with this sender
 * before, and how did it go?"
 *
 * Deliberately scoped to the CALLER's own deal history, read through their
 * own RLS-scoped Supabase client — never a cross-creator lookup. A
 * SECURITY DEFINER function aggregating every creator's deals by sender
 * domain would let one creator see another's negotiation history with a
 * shared sponsor; that is a real privacy design decision, not an
 * implementation detail, and this file does not make it unilaterally.
 */

export type OwnDomainHistory = {
  domain: string;
  isFreeEmail: boolean;
  /** Every past deal with this domain, excluding the one currently being viewed. */
  dealCount: number;
  agreedOrPaidCount: number;
  disputedCount: number;
  lastDealAt: string | null;
};

// Free consumer webmail — not itself a fraud signal, but a real one worth
// surfacing: a "brand" emailing from @gmail.com carries none of the domain
// history a company's own domain would.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "live.com",
  "msn.com",
]);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Reads the caller's own deal_chats — RLS decides which rows exist for them. */
export async function getOwnHistoryWithDomain(
  senderEmail: string,
  excludeChatId?: string,
): Promise<OwnDomainHistory | null> {
  const domain = extractDomain(senderEmail);
  if (!domain) return null;

  const supabase = await createClient();
  let query = supabase
    .from("deal_chats")
    .select("id, deal_status, created_at")
    .ilike("sender_email", `%@${domain}`);

  if (excludeChatId) query = query.neq("id", excludeChatId);

  const { data } = await query;
  const rows = data ?? [];

  return {
    domain,
    isFreeEmail: isFreeEmailDomain(domain),
    dealCount: rows.length,
    agreedOrPaidCount: rows.filter(
      (r) => r.deal_status === "agreed" || r.deal_status === "paid",
    ).length,
    disputedCount: rows.filter((r) => r.deal_status === "disputed").length,
    lastDealAt: rows.reduce<string | null>((latest, r) => {
      if (!r.created_at) return latest;
      return !latest || r.created_at > latest ? r.created_at : latest;
    }, null),
  };
}
