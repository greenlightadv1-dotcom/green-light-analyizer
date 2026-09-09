import "server-only";

/**
 * Runtime configuration report.
 *
 * Every optional integration in this product degrades quietly by design — the
 * analyzer falls back to a rule-based estimate without an AI key configured, the webhook
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
      name: "NVIDIA_API_KEY",
      set: Boolean(process.env.NVIDIA_API_KEY),
      required: false,
      impact:
        "The Deal Co-Pilot falls back to a rule-based estimate, labelled as such in the UI. Deals are still priced, just not by AI.",
    },
    {
      name: "RESEND_API_KEY",
      set: Boolean(process.env.RESEND_API_KEY),
      required: false,
      impact:
        "Creator replies are stored but never reach the company (§6), and POST /api/emails/send returns 503 — the outreach/system-notification dispatcher (src/lib/resend.ts) sends nothing.",
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
    {
      name: "GOOGLE_SAFE_BROWSING_API_KEY",
      set: Boolean(process.env.GOOGLE_SAFE_BROWSING_API_KEY),
      required: false,
      impact:
        "The Manual Analyzer's domain/security check shows 'unavailable' for the phishing/malware signal instead of a real result.",
    },
    {
      name: "IP2WHOIS_API_KEY",
      set: Boolean(process.env.IP2WHOIS_API_KEY),
      required: false,
      impact:
        "The Manual Analyzer's domain/security check shows 'unavailable' for the WHOIS/company-profile signal instead of a real result.",
    },
    {
      name: "YOUTUBE_API_KEY",
      set: Boolean(process.env.YOUTUBE_API_KEY),
      required: false,
      impact:
        "\"Sync from YouTube\" on Media Kit (subscriber/lifetime-view counts) fails with a clear error instead of syncing.",
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      set: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      required: false,
      impact:
        "YouTube/Instagram OAuth connect buttons show 'not configured' — the redirect_uri can't be built without a known base URL.",
    },
    {
      name: "GOOGLE_OAUTH_CLIENT_ID",
      set: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
      required: false,
      impact:
        "YouTube verified-audience-geography OAuth (§7.3, Pro/Elite) shows 'not configured' instead of connecting.",
    },
    {
      name: "GOOGLE_OAUTH_CLIENT_SECRET",
      set: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      required: false,
      impact: "Same as GOOGLE_OAUTH_CLIENT_ID — both are needed together.",
    },
    {
      name: "META_APP_ID",
      set: Boolean(process.env.META_APP_ID),
      required: false,
      impact:
        "Instagram verified-audience-geography OAuth (§7.3, Pro/Elite) shows 'not configured' instead of connecting.",
    },
    {
      name: "META_APP_SECRET",
      set: Boolean(process.env.META_APP_SECRET),
      required: false,
      impact: "Same as META_APP_ID — both are needed together.",
    },
    {
      name: "SUPABASE_WEBHOOK_SECRET",
      set: Boolean(process.env.SUPABASE_WEBHOOK_SECRET),
      required: false,
      impact:
        "POST /api/webhooks/supabase returns 503 and refuses every delivery — no database-change notification ever reaches Discord.",
    },
    {
      name: "DISCORD_SUPABASE_WEBHOOK_URL",
      set: Boolean(process.env.DISCORD_SUPABASE_WEBHOOK_URL),
      required: false,
      impact:
        "Database-change deliveries to /api/webhooks/supabase are accepted but never posted — the Discord channel stays silent.",
    },
    {
      name: "DISCORD_GITHUB_WEBHOOK_URL",
      set: Boolean(process.env.DISCORD_GITHUB_WEBHOOK_URL),
      required: false,
      impact:
        "GitHub activity has nowhere to post yet — point a GitHub webhook or CI step at a route that calls sendDiscordLog(\"github\", …) once one exists.",
    },
    {
      name: "DISCORD_DEPLOYS_WEBHOOK_URL",
      set: Boolean(process.env.DISCORD_DEPLOYS_WEBHOOK_URL),
      required: false,
      impact:
        "Deploy notifications have nowhere to post yet — point a Vercel deploy hook or CI step at a route that calls sendDiscordLog(\"deploys\", …) once one exists.",
    },
  ];

  const missingRequired = items
    .filter((i) => i.required && !i.set)
    .map((i) => i.name);

  return { items, missingRequired, ready: missingRequired.length === 0 };
}
