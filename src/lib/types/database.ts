/**
 * Typed shape of the Green Light schema (CLAUDE.md §10 + migrations 0002).
 *
 * Hand-written for now. Once the migrations are applied to the live project,
 * regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

import type { CompanyProfile } from "@/lib/ai/company-intel-types";
import type { SecurityCheckResult } from "@/lib/security/types";

export type Role = "creator" | "company" | "admin";
export type Region = "MENA" | "International";
export type SubscriptionPlan = "Starter" | "Pro" | "Elite";
export type Platform = "youtube" | "twitch" | "kick" | "instagram";
export type DealStatus =
  | "new"
  | "negotiating"
  | "agreed"
  | "paid"
  | "disputed";
export type AiEvaluation = "green" | "yellow" | "red";
export type SponsorshipType =
  | "video_dedicated"
  | "integration"
  | "story_share"
  | "live_mention"
  | "post"
  | "other";

/** Shape stored in declared_top_countries / verified_top_countries (§10). */
export type CountryShare = { country: string; pct: number };

/**
 * One row of `public.creator_directory()` — the company-facing browse list
 * (migration 0010). Deliberately not a subset of Profile: the function's own
 * SQL never selects primary_email or inbound_alias, so there is no type-level
 * risk of a caller assuming this shape carries either.
 */
export type CreatorDirectoryEntry = {
  creator_id: string;
  full_name: string;
  region: Region | null;
  content_category: string | null;
  content_language: string | null;
  avg_views: number | null;
  avg_ccv: number | null;
  engagement_rate: number | null;
  declared_top_countries: CountryShare[] | null;
  /** Only non-null when the strongest kit is audience_verified. */
  verified_top_countries: CountryShare[] | null;
  audience_verified: boolean;
  platforms: Platform[] | null;
  /** Added by migration 0024; absent until it is applied. */
  avatar_url?: string | null;
  country?: string | null;
  creator_categories?: string[] | null;
  creator_games?: string[] | null;
  content_formats?: string[] | null;
  /** Self-reported starting rate (0017). */
  base_rate_usd?: number | null;
  verified_geo_synced_at?: string | null;
  stats_synced_at?: string | null;
  /** Public profile slug; the /p/<slug> page is public by design. */
  shareable_slug?: string | null;
};

/** A Get Started application (migration 0024). Service-role only. */
export type AccessRequest = {
  id: string;
  journey: "creator" | "company" | "company_representative";
  full_name: string;
  email: string;
  company_name: string | null;
  website: string | null;
  primary_platform: string | null;
  channel_handle: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_profile_id: string | null;
};

/** A company account's link to another account acting for it (0024). */
export type CompanyMember = {
  member_id: string;
  company_id: string;
  member_role: "owner" | "representative";
  created_at: string;
  created_by: string | null;
};

/**
 * One row of `public.creator_public_profile(p_slug)` — the anon-readable
 * shareable-profile lookup (migration 0017). Not a subset of Profile for the
 * same reason as CreatorDirectoryEntry: the function's own SQL never selects
 * primary_email, inbound_alias, role or subscription fields.
 */
export type CreatorPublicProfile = {
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  primary_language: string | null;
  social_links: SocialLinks | null;
  base_rate_usd: number | null;
  platforms: Platform[] | null;
};

/** One row from consume_rate_limit() (migration 0019). */
export type RateLimitConsumption = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

/** Shape stored in profiles.social_links (migration 0017). All optional. */
export type SocialLinks = {
  youtube?: string;
  instagram?: string;
  tiktok?: string;
  x?: string;
  twitch?: string;
};

type Profile = {
  id: string;
  full_name: string;
  role: Role;
  region: Region | null;
  subscription_plan: SubscriptionPlan | null;
  /** NULL = no expiry. Only the service-role client ever writes it. */
  subscription_expires_at: string | null;
  inbound_alias: string | null;
  /**
   * The alias held before the most recent rotation (migration 0020). Still
   * accepted by the §5.3 intake, so a Gmail forwarding rule pointing at it
   * keeps working. Server-written only.
   */
  previous_inbound_alias: string | null;
  /** Creator PII — must never reach a company's client (§6, §12). */
  primary_email: string;
  must_change_password: boolean;
  /** Non-null = permanently banned (§6, §12). Only service_role writes it. */
  banned_at: string | null;
  banned_reason: string | null;
  created_at: string | null;
  /** Creator-profile layer (migration 0017) — additive to §7, not a replacement. */
  bio: string | null;
  avatar_url: string | null;
  country: string | null;
  primary_language: string | null;
  /** Self-reported starting rate — not part of the §7.4 pricing evaluation. */
  base_rate_usd: number | null;
  social_links: SocialLinks | null;
  /** Public profile path: greenlightadvs.com/p/<slug>. */
  shareable_slug: string | null;
  whatsapp_number: string | null;
  whatsapp_notifications_enabled: boolean;
  /**
   * Creator taxonomy and company details (migration 0024, local until
   * applied). Optional because a database without 0024 does not return them;
   * every reader treats a missing value as empty.
   */
  creator_categories?: string[] | null;
  creator_games?: string[] | null;
  content_formats?: string[] | null;
  company_website?: string | null;
  company_industry?: string | null;
};

/** §5.3 inbound-delivery trail. provider_message_id is the idempotency key. */
type InboundEmail = {
  id: string;
  provider_message_id: string;
  to_alias: string | null;
  creator_id: string | null;
  chat_id: string | null;
  sender_email: string | null;
  status: "processed" | "unknown_alias" | "rejected" | "failed";
  /** Operator-facing note only — never the message body. */
  detail: string | null;
  /** Subject line only, truncated. The body is still never stored here (0021). */
  subject: string | null;
  /** Screener score 0-100 (0021). Null when the delivery never got screened. */
  spam_score: number | null;
  /** The screener rules that fired, in plain language. */
  spam_reasons: string[] | null;
  created_at: string | null;
};

/** §6 masking-violation audit trail. Server-written, admin-readable. */
type ViolationLog = {
  id: string;
  profile_id: string;
  chat_id: string | null;
  message_id: string | null;
  /** Subset of 'email' | 'phone' | 'social'. */
  matched_rules: string[];
  /** Post-mask text. Raw contact details are never stored here. */
  redacted_excerpt: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string | null;
};

type MediaKit = {
  id: string;
  creator_id: string | null;
  platform: Platform;
  /** Channel/handle on the platform — needed by the §9 basic-stats APIs. */
  platform_handle: string | null;
  avg_views: number | null;
  avg_ccv: number | null;
  engagement_rate: number | null;
  content_category: string | null;
  content_language: string | null;
  /** Always rendered with a visible "self-reported" tag (§7.2). */
  declared_top_countries: CountryShare[] | null;
  /** Only ever populated by an OAuth Analytics/Insights sync (§7.2). */
  verified_top_countries: CountryShare[] | null;
  audience_verified: boolean | null;
  analytics_oauth_connected: boolean | null;
  last_synced_at: string | null;
  /** 0023: when verified_top_countries was fetched; see youtube-freshness.ts. */
  verified_geo_synced_at: string | null;
  /** 0023: when the public YouTube stats below were fetched; see youtube-freshness.ts. */
  youtube_stats_synced_at: string | null;
  /** Subscribers (YouTube) or followers (Instagram). Non-NULL = synced (migration 0014). */
  subscriber_count: number | null;
  /** BIGINT column — a large channel's lifetime total can exceed INTEGER range. */
  channel_view_count: number | null;
  /** Video count (YouTube) or post count (Instagram) (migration 0016). */
  media_count: number | null;
  /** AI-generated, supplementary to content_category (migration 0016). */
  content_tags: string[] | null;
};

type DealChat = {
  id: string;
  creator_id: string | null;
  company_id: string | null;
  sender_email: string;
  deal_status: DealStatus | null;
  /** What the sponsor offered — never the platform's own suggestion (0018). */
  offered_amount: number | null;
  ai_evaluation: AiEvaluation | null;
  sponsorship_type: SponsorshipType | null;
  target_countries: string[] | null;
  created_at: string | null;
  /** Co-Pilot recommendation at creation time. Null on pre-0018 rows. */
  recommended_price_usd: number | null;
  /** service_role-written only — see 0003/0017's reasoning for ai_evaluation. */
  security_check: SecurityCheckResult | null;
  /** Always true for in-app/Manual-Analyzer deals; only email intake can set it false. */
  is_likely_sponsorship: boolean;
  /**
   * AI-GENERATED account of the sender's company (0021) — distinct from
   * `security_check`, which is measured. Null until a creator runs it.
   * service_role-written only.
   */
  company_profile: CompanyProfile | null;
};

type Message = {
  id: string;
  chat_id: string | null;
  sender_id: string | null;
  message_text: string;
  is_masked: boolean | null;
  /** Set once the message reached the company as platform email (§6). */
  relayed_at: string | null;
  relay_error: string | null;
  created_at: string | null;
};

export type AdminActionType =
  | "plan_change"
  | "region_change"
  | "role_change"
  | "ban"
  | "unban"
  | "renewal";

/** Audit trail for admin edits to an existing account (migration 0012). */
type AdminAction = {
  id: string;
  admin_id: string | null;
  target_profile_id: string | null;
  action: AdminActionType;
  old_value: string | null;
  new_value: string | null;
  created_at: string | null;
};

/**
 * Single-use trial/promo code (migration 0013). No RLS policy for
 * `authenticated` at all -- every read and write goes through
 * createAdminClient(), so this type is only ever used server-side.
 */
type PromoCode = {
  code: string;
  duration_days: number;
  target_plan: Extract<SubscriptionPlan, "Pro" | "Elite">;
  is_used: boolean;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_by: string | null;
  created_at: string | null;
};

export type OAuthPlatform = "youtube" | "instagram";

/**
 * YouTube Analytics / Instagram Graph API OAuth tokens (migration 0015). No
 * RLS policy for `authenticated` at all -- server-only, like PromoCode.
 */
type OAuthConnection = {
  id: string;
  creator_id: string;
  platform: OAuthPlatform;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  external_account_id: string | null;
  scope: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** Columns with a database default (or that are nullable) are optional on insert. */
/** Dated platform-stats measurement for growth (0025). Server-written only. */
export type MediaKitSnapshot = {
  id: number;
  media_kit_id: string;
  creator_id: string;
  platform: Platform;
  source: "youtube_data_api" | "instagram_graph_api";
  captured_on: string;
  captured_at: string;
  subscriber_count: number | null;
  channel_view_count: number | null;
  media_count: number | null;
};


/* ---- Collaboration lifecycle (migration 0026). Server-written only. ---- */
export type BriefStatus = "draft" | "published" | "archived";
export type InvitationStatus = "pending" | "changes_requested" | "accepted" | "declined" | "withdrawn";
export type CollaborationStatus = "negotiating" | "active" | "completed" | "cancelled";
export type DeliverableStatus = "pending" | "submitted" | "revision_requested" | "approved";

export type Brief = {
  id: string;
  company_id: string;
  title: string;
  description: string;
  sponsorship_type: SponsorshipType | null;
  platforms: string[];
  target_countries: string[];
  categories: string[];
  deliverables_summary: string | null;
  budget_min_usd: number | null;
  budget_max_usd: number | null;
  start_date: string | null;
  due_date: string | null;
  status: BriefStatus;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Invitation = {
  id: string;
  brief_id: string;
  company_id: string;
  creator_id: string;
  message: string;
  proposed_amount_usd: number | null;
  status: InvitationStatus;
  response_note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Collaboration = {
  id: string;
  invitation_id: string;
  brief_id: string;
  company_id: string;
  creator_id: string;
  deal_chat_id: string | null;
  status: CollaborationStatus;
  proposed_amount_usd: number | null;
  proposed_terms: string | null;
  proposed_by: string | null;
  company_confirmed_at: string | null;
  creator_confirmed_at: string | null;
  agreed_amount_usd: number | null;
  agreed_terms: string | null;
  agreed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Deliverable = {
  id: string;
  collaboration_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: DeliverableStatus;
  submission_url: string | null;
  submission_note: string | null;
  submitted_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  revision_count: number;
  created_at: string;
  updated_at: string;
};

export type CollaborationEvent = {
  id: number;
  invitation_id: string | null;
  collaboration_id: string | null;
  deliverable_id: string | null;
  actor_id: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Optional<
          Profile,
          | "region"
          | "subscription_plan"
          | "subscription_expires_at"
          | "inbound_alias"
          | "previous_inbound_alias"
          | "must_change_password"
          | "banned_at"
          | "banned_reason"
          | "created_at"
          | "bio"
          | "avatar_url"
          | "country"
          | "primary_language"
          | "base_rate_usd"
          | "social_links"
          | "shareable_slug"
          | "whatsapp_number"
          | "whatsapp_notifications_enabled"
        >
      >;
      media_kits: Table<
        MediaKit,
        Optional<MediaKit, Exclude<keyof MediaKit, "platform">>
      >;
      deal_chats: Table<
        DealChat,
        Optional<DealChat, Exclude<keyof DealChat, "sender_email">>
      >;
      messages: Table<
        Message,
        Optional<Message, Exclude<keyof Message, "message_text">>
      >;
      access_requests: Table<
        AccessRequest,
        Optional<
          AccessRequest,
          | "id"
          | "company_name"
          | "website"
          | "primary_platform"
          | "channel_handle"
          | "message"
          | "status"
          | "created_at"
          | "reviewed_at"
          | "reviewed_by"
          | "created_profile_id"
        >
      >;
      company_members: Table<
        CompanyMember,
        Optional<CompanyMember, "created_at" | "created_by">
      >;
      inbound_emails: Table<
        InboundEmail,
        Optional<
          InboundEmail,
          Exclude<keyof InboundEmail, "provider_message_id" | "status">
        >
      >;
      violation_logs: Table<
        ViolationLog,
        Optional<
          ViolationLog,
          Exclude<
            keyof ViolationLog,
            "profile_id" | "matched_rules" | "redacted_excerpt"
          >
        >
      >;
      media_kit_snapshots: Table<
        MediaKitSnapshot,
        Optional<
          MediaKitSnapshot,
          Exclude<keyof MediaKitSnapshot, "media_kit_id" | "creator_id" | "platform" | "source">
        >
      >;
      briefs: Table<Brief, Optional<Brief, Exclude<keyof Brief, "company_id" | "title" | "description">>>;
      invitations: Table<Invitation, Optional<Invitation, Exclude<keyof Invitation, "brief_id" | "company_id" | "creator_id" | "message">>>;
      collaborations: Table<Collaboration, Optional<Collaboration, Exclude<keyof Collaboration, "invitation_id" | "brief_id" | "company_id" | "creator_id">>>;
      deliverables: Table<Deliverable, Optional<Deliverable, Exclude<keyof Deliverable, "collaboration_id" | "title">>>;
      collaboration_events: Table<CollaborationEvent, Optional<CollaborationEvent, Exclude<keyof CollaborationEvent, "event_type">>>;
      admin_actions: Table<
        AdminAction,
        Optional<AdminAction, Exclude<keyof AdminAction, "action">>
      >;
      promo_codes: Table<
        PromoCode,
        Optional<
          PromoCode,
          Exclude<keyof PromoCode, "code" | "duration_days" | "target_plan" | "expires_at">
        >
      >;
      oauth_connections: Table<
        OAuthConnection,
        Optional<
          OAuthConnection,
          Exclude<keyof OAuthConnection, "creator_id" | "platform" | "access_token" | "expires_at">
        >
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /** SECURITY DEFINER RPC (migration 0010) — see CreatorDirectoryEntry. */
      creator_directory: {
        Args: Record<string, never>;
        Returns: CreatorDirectoryEntry[];
      };
      /** SECURITY DEFINER RPC (migration 0017) — see CreatorPublicProfile. */
      creator_public_profile: {
        Args: { p_slug: string };
        Returns: CreatorPublicProfile[];
      };
      /* 0026 transitions: service_role only. Each raises 'collab:<code>' on refusal. */
      collab_create_invitation: { Args: { p_company: string; p_brief: string; p_creator: string; p_message: string; p_amount: number | null }; Returns: string };
      collab_withdraw_invitation: { Args: { p_company: string; p_invitation: string }; Returns: undefined };
      collab_revise_invitation: { Args: { p_company: string; p_invitation: string; p_message: string; p_amount: number | null }; Returns: undefined };
      collab_respond_invitation: { Args: { p_creator: string; p_invitation: string; p_response: string; p_note: string | null }; Returns: string | null };
      collab_propose_terms: { Args: { p_actor: string; p_collab: string; p_amount: number; p_terms: string }; Returns: undefined };
      collab_confirm_terms: { Args: { p_actor: string; p_collab: string }; Returns: string };
      collab_add_deliverable: { Args: { p_company: string; p_collab: string; p_title: string; p_description: string | null; p_due: string | null }; Returns: string };
      collab_remove_deliverable: { Args: { p_company: string; p_deliverable: string }; Returns: undefined };
      collab_submit_deliverable: { Args: { p_creator: string; p_deliverable: string; p_url: string | null; p_note: string | null }; Returns: undefined };
      collab_review_deliverable: { Args: { p_company: string; p_deliverable: string; p_decision: string; p_note: string | null }; Returns: undefined };
      collab_complete: { Args: { p_company: string; p_collab: string }; Returns: undefined };
      collab_cancel: { Args: { p_actor: string; p_collab: string; p_reason: string }; Returns: undefined };
      /** service_role-only counter (migration 0019) — see lib/rate-limit.ts. */
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: RateLimitConsumption[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
