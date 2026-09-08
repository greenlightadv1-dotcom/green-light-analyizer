-- ---------------------------------------------------------------------------
-- Green Light — YouTube verified stats + admin renewal audit action
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_kits
  ADD COLUMN subscriber_count INTEGER,
  ADD COLUMN channel_view_count BIGINT;

COMMENT ON COLUMN public.media_kits.subscriber_count IS
  'YouTube channel subscriber count. Non-NULL = populated by a "Sync from YouTube" action (verified), same pattern as verified_top_countries -- no separate boolean needed. NULL until the first sync.';
COMMENT ON COLUMN public.media_kits.channel_view_count IS
  'YouTube channel lifetime view count. BIGINT because a large channel''s total can exceed the INTEGER range. Same verified-by-non-NULL convention as subscriber_count.';

ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('plan_change', 'region_change', 'role_change', 'ban', 'unban', 'renewal'));

COMMENT ON TABLE public.admin_actions IS
  'Audit trail for admin edits to an existing account (plan/region/role/ban/renewal) made from /admin/users. Every row is written by the service-role client from a server action that already re-checked requireRole(''admin'') -- there is no INSERT/UPDATE/DELETE policy for authenticated because nothing but that service-role path should ever write here. "renewal" (0014): old/new value are the previous and new subscription_expires_at, written whenever an admin applies an explicit duration -- independently of whether a plan_change row is also written for the same submission.';
