import type { Profile } from "@/lib/auth";
import type { DealChat, Message } from "@/lib/deals/queries";
import type { MediaKit } from "@/lib/media-kit/queries";

/**
 * Mock dataset for the UI preview at /preview.
 *
 * Every value here is invented. No real creator, company, email address or
 * figure appears — the addresses use `.example` and `example.com`, which are
 * reserved and cannot be registered by anyone.
 *
 * The data is chosen to exercise the states that are easy to get wrong and
 * therefore worth looking at:
 *
 *   - a masked message, so the §6 filter's output is visible
 *   - a self-reported media kit AND a verified one, so the §7.2 badges sit
 *     side by side
 *   - a green, a yellow and a red rating, including one the §7.4 cap pulled
 *     down from green
 *   - a Starter plan at its §8 connection limit, so the locked card renders
 */

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const mockProfile: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Amir Khaled",
  role: "creator",
  region: "MENA",
  subscription_plan: "Starter",
  subscription_expires_at: null,
  inbound_alias: "amir.k3f9x2@analyze.greenlight.com",
  primary_email: "amir@example.com",
  must_change_password: false,
  banned_at: null,
  banned_reason: null,
  created_at: ago(60 * 24 * 40),
  bio: "Tech reviews and gaming streams in Arabic, reaching MENA audiences across YouTube and Twitch.",
  avatar_url: null,
  country: "Egypt",
  primary_language: "Arabic",
  base_rate_usd: 1200,
  social_links: {
    youtube: "@amirkhaled",
    instagram: "@amir.khaled",
    twitch: "amirlive",
  },
  shareable_slug: "amirkhaled",
  whatsapp_number: null,
  whatsapp_notifications_enabled: false,
};

export const mockAdminProfile: Profile = {
  ...mockProfile,
  id: "00000000-0000-4000-8000-000000000009",
  full_name: "Nour Hassan",
  role: "admin",
  subscription_plan: "Elite",
  inbound_alias: null,
  primary_email: "nour@example.com",
};

export const mockChats: DealChat[] = [
  {
    id: "00000000-0000-4000-8000-00000000aa01",
    creator_id: mockProfile.id,
    // A registered company account sent this directly, in-app (§3, Discover) —
    // company_id set is exactly the signal the dual-source badge/filter reads.
    company_id: "00000000-0000-4000-8000-000000000099",
    sender_email: "partnerships@northwind.example",
    deal_status: "negotiating",
    offered_amount: 1800,
    ai_evaluation: "green",
    sponsorship_type: "video_dedicated",
    target_countries: ["EG", "SA", "AE"],
    created_at: ago(90),
    // A registered company account sent this directly, in-app (§3, Discover).
    security_check: null,
    is_likely_sponsorship: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000aa02",
    creator_id: mockProfile.id,
    company_id: null,
    sender_email: "growth@lumenapp.example",
    deal_status: "new",
    offered_amount: 2400,
    // Capped from green by §7.4: high value on self-reported geography.
    ai_evaluation: "yellow",
    sponsorship_type: "integration",
    target_countries: ["SA"],
    created_at: ago(300),
    security_check: {
      domain: "lumenapp.example",
      trustScore: 88,
      reasons: [],
      whois: {
        domain: "lumenapp.example",
        registrantOrganization: "Lumen App Inc.",
        registrantName: "REDACTED FOR PRIVACY",
        registrantCountry: "US",
        createdAt: ago(60 * 24 * 365 * 4),
        expiresAt: ago(-60 * 24 * 365),
        whoisServer: "whois.example-registrar.com",
      },
      safeBrowsing: { flagged: false, threatTypes: [] },
    },
    is_likely_sponsorship: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000aa03",
    creator_id: mockProfile.id,
    company_id: null,
    sender_email: "promo@quickcash-offers.example",
    deal_status: "new",
    offered_amount: 90,
    ai_evaluation: "red",
    sponsorship_type: "post",
    target_countries: null,
    created_at: ago(700),
    security_check: {
      domain: "quickcash-offers.example",
      trustScore: 22,
      reasons: [
        "domain registered under 6 months ago",
        "registrant organization is hidden",
      ],
      whois: {
        domain: "quickcash-offers.example",
        registrantOrganization: null,
        registrantName: null,
        registrantCountry: null,
        createdAt: ago(60 * 24 * 40),
        expiresAt: ago(-60 * 24 * 325),
        whoisServer: "whois.example-registrar.com",
      },
      safeBrowsing: { flagged: false, threatTypes: [] },
    },
    // The inbound-email spam/notification filter's best guess, not a certainty.
    is_likely_sponsorship: false,
  },
  {
    id: "00000000-0000-4000-8000-00000000aa04",
    creator_id: mockProfile.id,
    company_id: null,
    sender_email: "brand@atlasfit.example",
    deal_status: "agreed",
    offered_amount: 950,
    ai_evaluation: "green",
    sponsorship_type: "story_share",
    target_countries: ["EG"],
    created_at: ago(60 * 26),
    security_check: null,
    is_likely_sponsorship: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000aa05",
    creator_id: mockProfile.id,
    company_id: null,
    sender_email: "media@harbourgames.example",
    deal_status: "paid",
    offered_amount: 1400,
    ai_evaluation: "green",
    sponsorship_type: "live_mention",
    target_countries: ["EG", "MA"],
    created_at: ago(60 * 24 * 9),
    security_check: null,
    is_likely_sponsorship: true,
  },
];

export const mockMessages: Message[] = [
  {
    id: "00000000-0000-4000-8000-00000000bb01",
    chat_id: mockChats[0].id,
    // Platform-authored: the Co-Pilot summary has no account behind it.
    sender_id: null,
    message_text: [
      "Deal Co-Pilot — GREEN",
      "",
      "They offered roughly $1,800.",
      "Recommended: $2,100 (fair range $1,700–$2,600).",
      "",
      "68% of your audience sits in the countries this sponsor is targeting, and engagement of 5.1% is healthy for the category. The offer is close to fair — there is room to ask for $2,100.",
    ].join("\n"),
    is_masked: false,
    relayed_at: null,
    relay_error: null,
    created_at: ago(90),
  },
  {
    id: "00000000-0000-4000-8000-00000000bb02",
    chat_id: mockChats[0].id,
    sender_id: null,
    message_text:
      "Hi Amir — we loved your last two videos and would like to book a dedicated review for our spring launch. Budget is $1,800. Could you share your availability for the first week of next month?",
    is_masked: false,
    relayed_at: null,
    relay_error: null,
    created_at: ago(88),
  },
  {
    id: "00000000-0000-4000-8000-00000000bb03",
    chat_id: mockChats[0].id,
    sender_id: mockProfile.id,
    message_text:
      "Thanks for reaching out. A dedicated review works — my rate for that format is $2,100, which reflects the audience overlap with your target markets. I have space in the first week.",
    is_masked: false,
    relayed_at: ago(40),
    relay_error: null,
    created_at: ago(42),
  },
  {
    id: "00000000-0000-4000-8000-00000000bb04",
    chat_id: mockChats[0].id,
    sender_id: null,
    // The §6 filter's real output, so the preview shows what masking looks like.
    message_text:
      "That works. Easier to finish this over [locked: external link hidden] — my number is [locked: phone hidden by platform policy], or mail me at [locked: email hidden by platform policy].",
    is_masked: true,
    relayed_at: null,
    relay_error: null,
    created_at: ago(20),
  },
];

export const mockKits: MediaKit[] = [
  {
    id: "00000000-0000-4000-8000-00000000cc01",
    creator_id: mockProfile.id,
    platform: "youtube",
    platform_handle: "@amirkhaled",
    avg_views: 148_000,
    avg_ccv: 0,
    engagement_rate: 5.1,
    content_category: "tech",
    content_language: "Arabic",
    declared_top_countries: [
      { country: "EG", pct: 38 },
      { country: "SA", pct: 22 },
      { country: "AE", pct: 12 },
    ],
    // Verified geography differs from declared — which is the point of §7.2.
    verified_top_countries: [
      { country: "EG", pct: 41 },
      { country: "SA", pct: 19 },
      { country: "AE", pct: 8 },
      { country: "MA", pct: 6 },
    ],
    audience_verified: true,
    analytics_oauth_connected: true,
    last_synced_at: ago(180),
    subscriber_count: 212_000,
    channel_view_count: 18_400_000,
    media_count: 340,
    content_tags: ["tech", "reviews", "unboxing"],
  },
  {
    id: "00000000-0000-4000-8000-00000000cc02",
    creator_id: mockProfile.id,
    platform: "twitch",
    platform_handle: "amirlive",
    avg_views: 9_400,
    avg_ccv: 620,
    engagement_rate: 3.4,
    content_category: "gaming",
    content_language: "Arabic",
    declared_top_countries: [
      { country: "EG", pct: 45 },
      { country: "SA", pct: 20 },
    ],
    // Twitch exposes no per-viewer geography to third parties (§7.3).
    verified_top_countries: null,
    audience_verified: false,
    analytics_oauth_connected: false,
    last_synced_at: ago(60 * 24 * 3),
    subscriber_count: null,
    channel_view_count: null,
    media_count: null,
    content_tags: null,
  },
];
