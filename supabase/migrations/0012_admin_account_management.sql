-- ---------------------------------------------------------------------------
-- Green Light — admin account management audit trail
--
-- /admin/users can create accounts but had no way to edit one afterward: no
-- path to apply a plan upgrade once a Discord payment is confirmed (§4.3), no
-- way to correct a miscreated region/role, no ban outside the §6 violation
-- queue. The edits themselves are plain UPDATEs on public.profiles, already
-- covered by the profiles_update policy (0004) — nothing new to grant there.
--
-- This migration adds only the audit trail: every such edit, made through the
-- admin-only server actions, is recorded here so who-changed-what is never
-- just "check the current row and guess".
-- ---------------------------------------------------------------------------

CREATE TABLE public.admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT CHECK (action IN
    ('plan_change', 'region_change', 'role_change', 'ban', 'unban')) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_actions IS
  'Audit trail for admin edits to an existing account (plan/region/role/ban) made from /admin/users. Every row is written by the service-role client from a server action that already re-checked requireRole(''admin'') — there is no INSERT/UPDATE/DELETE policy for authenticated because nothing but that service-role path should ever write here.';

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Admin-only read. No write policy: every insert goes through
-- createAdminClient() (service role bypasses RLS), same as violation_logs and
-- profiles.banned_at already do — see 0006/0004.
CREATE POLICY admin_actions_select ON public.admin_actions
  FOR SELECT TO authenticated
  USING (private.is_admin());
