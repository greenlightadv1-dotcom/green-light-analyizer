/**
 * Typed shape of the Green Light schema (CLAUDE.md §10 + migrations 0002).
 *
 * Hand-written for now. Once the migrations are applied to the live project,
 * regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

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

type Profile = {
  id: string;
  full_name: string;
  role: Role;
  region: Region | null;
  subscription_plan: SubscriptionPlan | null;
  inbound_alias: string | null;
  /** Creator PII — must never reach a company's client (§6, §12). */
  primary_email: string;
  must_change_password: boolean;
  created_at: string | null;
};

type MediaKit = {
  id: string;
  creator_id: string | null;
  platform: Platform;
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
};

type DealChat = {
  id: string;
  creator_id: string | null;
  company_id: string | null;
  sender_email: string;
  deal_status: DealStatus | null;
  offered_amount: number | null;
  ai_evaluation: AiEvaluation | null;
  sponsorship_type: SponsorshipType | null;
  target_countries: string[] | null;
  created_at: string | null;
};

type Message = {
  id: string;
  chat_id: string | null;
  sender_id: string | null;
  message_text: string;
  is_masked: boolean | null;
  created_at: string | null;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
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
        Omit<Profile, "created_at" | "must_change_password"> & {
          created_at?: string;
          must_change_password?: boolean;
        }
      >;
      media_kits: Table<MediaKit, Omit<MediaKit, "id"> & { id?: string }>;
      deal_chats: Table<DealChat, Omit<DealChat, "id"> & { id?: string }>;
      messages: Table<Message, Omit<Message, "id"> & { id?: string }>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
