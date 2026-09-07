import "server-only";

/**
 * Runtime configuration report.
 *
 * Every optional integration in this product degrades quietly by design — the
 * analyzer falls back to a rule-based estimate without Gemini, the webhook
 * returns 503 without a signing secret, the relay records an error without a
 * Resend key. That is the right behaviour, and it is also exactly how a
 * deployment ends up half-working with nobody able to say which half.
 *
 * This reports which variables are present. It reports **presence only** —
 * never a value, never a prefix, never a length. A page that renders "your key
 * starts with sk_live_ab…" has leaked part of the key to anyone who can see
 * the page.
 */

export type ConfigItem = {
  name: string;
  set: boolean;
  required: boolean;
  /** What stops working when this is missing. */
  impact: string;
};

export type ConfigReport = {
  items: ConfigItem[];
  missingRequired: string[];
  ready: boolean;
};

export function readConfigReport(): ConfigReport {
  const items: ConfigItem[] = [
    {
      name: "NEXT_PUBLIC_SUPABASE_URL",
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      required: true,
      impact: "Nothing works — no database connection at all.",
    },
    {
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      required: true,
      impact: "Nobody can sign in.",
    },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      required: true,
      impact:
        "No account creation, no forced password reset, no messages, no inbound email. Most of the product is inert.",
    },
    {
      name: "NEXT_PUBLIC_INBOUND_DOMAIN",
      set: Boolean(process.env.NEXT_PUBLIC_INBOUND_DOMAIN),
      required: false,
      impact:
        "Falls back to analyze.greenlight.com. Wrong only if the real inbound domain differs.",
    },
    {
      name: "GEMINI_API_KEY",
      set: Boolean(process.env.GEMINI_API_KEY),
      required: false,
      impact:
        "The Deal Co-Pilot falls back to a rule-based estimate, labelled as such in the UI. Deals are still priced, just not by AI.",
    },
    {
      name: "RESEND_API_KEY",
      set: Boolean(process.env.RESEND_API_KEY),
      required: false,
      impact:
        "Creator replies are stored but never reach the company (§6). The conversation looks fine in-app and is silently one-way.",
    },
    {
      name: "RESEND_INBOUND_WEBHOOK_SECRET",
      set: Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET),
      required: false,
      impact:
        "The inbound webhook returns 503 and refuses every delivery. No offer ever becomes a deal room.",
    },
    {
      name: "RESEND_FROM_ADDRESS",
      set: Boolean(process.env.RESEND_FROM_ADDRESS),
      required: false,
      impact:
        "Relayed email is sent from deals@<inbound domain>. That address must be a verified sender in Resend.",
    },
  ];

  const missingRequired = items
    .filter((i) => i.required && !i.set)
    .map((i) => i.name);

  return { items, missingRequired, ready: missingRequired.length === 0 };
}
