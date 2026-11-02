import type { AppNotification, ContentItem, PortfolioItem, Brief, Collaboration, CollaborationEvent, Deliverable, Invitation } from "@/lib/types/database";

/**
 * Invented collaboration data for the /preview screens only. Nothing here is
 * read by the real app, and every name and figure is made up.
 */

const CO = "00000000-0000-4000-8000-0000000000c1";
const CR = "00000000-0000-4000-8000-0000000000a1";
const CR2 = "00000000-0000-4000-8000-0000000000a2";

export const previewIds = { company: CO, creator: CR };

export const previewNames: Record<string, string> = {
  [CO]: "Nimbus Audio (demo)",
  [CR]: "Layla Hassan (demo)",
  [CR2]: "Omar Tech Reviews (demo)",
};

export const previewBriefs: Brief[] = [
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    company_id: CO,
    title: "Wireless earbuds launch — MENA tech reviewers",
    description: "We are launching a new pair of wireless earbuds in Egypt and Saudi Arabia and want honest first-impression reviews from tech creators.",
    sponsorship_type: "integration",
    platforms: ["youtube", "instagram"],
    target_countries: ["EG", "SA"],
    categories: ["tech"],
    deliverables_summary: "One 60–90 second integration in a regular video, plus one story share on launch day.",
    budget_min_usd: 800,
    budget_max_usd: 1500,
    start_date: "2026-11-10",
    due_date: "2026-12-01",
    status: "published",
    published_at: "2026-11-01T09:00:00Z",
    archived_at: null,
    created_at: "2026-10-30T09:00:00Z",
    updated_at: "2026-11-01T09:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000b2",
    company_id: CO,
    title: "Holiday gift guide (draft)",
    description: "A seasonal gift-guide placement. Details still being worked out with the marketing team.",
    sponsorship_type: null,
    platforms: [],
    target_countries: [],
    categories: [],
    deliverables_summary: null,
    budget_min_usd: null,
    budget_max_usd: null,
    start_date: null,
    due_date: null,
    status: "draft",
    published_at: null,
    archived_at: null,
    created_at: "2026-11-02T08:00:00Z",
    updated_at: "2026-11-02T08:00:00Z",
  },
];

export const previewInvitations: Invitation[] = [
  {
    id: "00000000-0000-4000-8000-0000000000d1",
    brief_id: previewBriefs[0].id,
    company_id: CO,
    creator_id: CR,
    message: "We love your review style and would like you to cover the launch.",
    proposed_amount_usd: 1200,
    status: "accepted",
    response_note: null,
    responded_at: "2026-11-01T12:00:00Z",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000d2",
    brief_id: previewBriefs[0].id,
    company_id: CO,
    creator_id: CR2,
    message: "Would a dedicated short work for your channel?",
    proposed_amount_usd: null,
    status: "pending",
    response_note: null,
    responded_at: null,
    created_at: "2026-11-02T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
  },
];

export const previewCreatorInvitations: Invitation[] = [
  { ...previewInvitations[1], creator_id: CR, id: "00000000-0000-4000-8000-0000000000d3" },
  previewInvitations[0],
];

export const previewCollaboration: Collaboration = {
  id: "00000000-0000-4000-8000-0000000000e1",
  invitation_id: previewInvitations[0].id,
  brief_id: previewBriefs[0].id,
  company_id: CO,
  creator_id: CR,
  deal_chat_id: null,
  status: "active",
  proposed_amount_usd: 1300,
  proposed_terms: "One 60–90 second integration, one story share on launch day, 30-day usage rights for the clip, no category exclusivity.",
  proposed_by: CR,
  company_confirmed_at: "2026-11-02T09:00:00Z",
  creator_confirmed_at: "2026-11-02T08:30:00Z",
  agreed_amount_usd: 1300,
  agreed_terms: "One 60–90 second integration, one story share on launch day, 30-day usage rights for the clip, no category exclusivity.",
  agreed_at: "2026-11-02T09:00:00Z",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-02T09:00:00Z",
};

export const previewDeliverables: Deliverable[] = [
  {
    id: "00000000-0000-4000-8000-0000000000f1",
    collaboration_id: previewCollaboration.id,
    title: "Video integration",
    description: "60–90 seconds, mid-roll.",
    due_date: "2026-11-25",
    status: "revision_requested",
    submission_url: "https://example.com/draft-cut",
    submission_note: "First cut for review.",
    submitted_at: "2026-11-02T11:00:00Z",
    review_note: "Please mention the battery life figure from the brief.",
    reviewed_at: "2026-11-02T12:00:00Z",
    approved_at: null,
    revision_count: 1,
    created_at: "2026-11-02T09:10:00Z",
    updated_at: "2026-11-02T12:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000f2",
    collaboration_id: previewCollaboration.id,
    title: "Launch-day story",
    description: null,
    due_date: "2026-12-01",
    status: "pending",
    submission_url: null,
    submission_note: null,
    submitted_at: null,
    review_note: null,
    reviewed_at: null,
    approved_at: null,
    revision_count: 0,
    created_at: "2026-11-02T09:11:00Z",
    updated_at: "2026-11-02T09:11:00Z",
  },
];

const ev = (id: number, type: string, actor: string, at: string): CollaborationEvent => ({
  id, invitation_id: previewInvitations[0].id, collaboration_id: id > 2 ? previewCollaboration.id : null,
  deliverable_id: null, actor_id: actor, event_type: type, detail: {}, created_at: at,
});

export const previewEvents: CollaborationEvent[] = [
  ev(1, "invitation_sent", CO, "2026-11-01T10:00:00Z"),
  ev(2, "invitation_accepted", CR, "2026-11-01T12:00:00Z"),
  ev(3, "terms_proposed", CR, "2026-11-02T08:30:00Z"),
  ev(4, "terms_confirmed", CR, "2026-11-02T08:30:00Z"),
  ev(5, "terms_agreed", CO, "2026-11-02T09:00:00Z"),
  ev(6, "deliverable_added", CO, "2026-11-02T09:10:00Z"),
  ev(7, "deliverable_submitted", CR, "2026-11-02T11:00:00Z"),
  ev(8, "revision_requested", CO, "2026-11-02T12:00:00Z"),
];

export const previewNotifications: AppNotification[] = [
  { id: "00000000-0000-4000-8000-000000000101", recipient_id: CR, event_id: 8, kind: "revision_requested", category: "deliverables", brief_id: previewBriefs[0].id, invitation_id: previewInvitations[0].id, collaboration_id: previewCollaboration.id, actor_id: CO, read_at: null, created_at: "2026-11-02T12:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000102", recipient_id: CR, event_id: 9, kind: "invitation_sent", category: "invitations", brief_id: previewBriefs[0].id, invitation_id: "00000000-0000-4000-8000-0000000000d3", collaboration_id: null, actor_id: CO, read_at: null, created_at: "2026-11-02T10:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000103", recipient_id: CR, event_id: 5, kind: "terms_agreed", category: "terms", brief_id: previewBriefs[0].id, invitation_id: previewInvitations[0].id, collaboration_id: previewCollaboration.id, actor_id: CO, read_at: "2026-11-02T09:30:00Z", created_at: "2026-11-02T09:00:00Z" },
];

export const previewShortlists = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    name: "Tech reviewers (demo)",
    entries: [
      { creator_id: CR, name: previewNames[CR], note: "Strong Arabic audience, fast turnaround.", added_at: "2026-11-01T08:00:00Z" },
      { creator_id: CR2, name: previewNames[CR2], note: null, added_at: "2026-11-02T08:00:00Z" },
    ],
  },
  { id: "00000000-0000-4000-8000-000000000202", name: "Holiday campaign (demo)", entries: [] },
];

export const previewPortfolio: PortfolioItem[] = [
  { id: "00000000-0000-4000-8000-000000000301", creator_id: CR, title: "Budget phone showdown", description: "Side-by-side review of five budget phones, filmed in Cairo.", url: "https://example.com/phones", platform: "youtube", brand_name: "Nimbus Audio (demo)", brand_name_public: true, published_on: "2026-09-14", is_public: true, sort_order: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000302", creator_id: CR, title: "Launch-day story set", description: null, url: null, platform: "instagram", brand_name: "Unnamed partner (demo)", brand_name_public: false, published_on: "2026-08-02", is_public: true, sort_order: 2, created_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000303", creator_id: CR, title: "Draft: studio tour", description: "Not ready to share yet.", url: null, platform: null, brand_name: null, brand_name_public: false, published_on: null, is_public: false, sort_order: 3, created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" },
];

const ci = (id: string, kind: ContentItem["kind"], title: string, status: ContentItem["status"], planned_for: string | null, body: string | null = null, tags: string[] = []): ContentItem => ({
  id, creator_id: CR, kind, title, body, status, platform: "youtube", planned_for, tags, collaboration_id: null,
  created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
});

export const previewContent: ContentItem[] = [
  ci("00000000-0000-4000-8000-000000000401", "idea", "Earbuds in a sandstorm test", "idea", null, null, ["tech"]),
  ci("00000000-0000-4000-8000-000000000402", "script", "Launch integration script", "drafting", "2026-11-20", "Cold open on the commute. 60 seconds on battery and noise cancelling. Close with the honest downside."),
  ci("00000000-0000-4000-8000-000000000403", "hook", "“I wore these for 30 days”", "ready", null),
  ci("00000000-0000-4000-8000-000000000404", "title", "Budget earbuds that beat the big brands?", "scheduled", "2026-11-25"),
  ci("00000000-0000-4000-8000-000000000405", "description", "October phone roundup description", "published", "2026-11-03"),
];
