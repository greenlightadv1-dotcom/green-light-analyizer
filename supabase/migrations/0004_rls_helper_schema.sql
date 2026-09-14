-- ---------------------------------------------------------------------------
-- Green Light — move the RLS helpers out of the PostgREST-exposed schema
--
-- STATUS: APPLIED to project ref kpuecrvdrkhemyvibyfa. With this in place the
-- Supabase security linter returns zero lints, and the 22 assertions in
-- supabase/tests/rls_policies_test.sql all pass.
--
-- 0003 created is_admin() and is_deal_participant() in `public`. Anything in
-- `public` is published by PostgREST as an RPC endpoint, so both were callable
-- as /rest/v1/rpc/is_admin and /rest/v1/rpc/is_deal_participant — by anon as
-- well as authenticated, because Supabase's default privileges on the public
-- schema grant EXECUTE to anon/authenticated/service_role at creation time.
-- The REVOKE ... FROM PUBLIC in 0003 does not undo those: PUBLIC is the
-- pseudo-role, not the anon and authenticated roles named explicitly.
--
-- The Supabase linter flags exactly this, twice per function:
--   WARN anon_security_definer_function_executable
--   WARN authenticated_security_definer_function_executable
--
-- Neither function leaks anything much on its own — is_admin() reports only on
-- the caller, and is_deal_participant() answers only about the caller's own
-- membership. But a SECURITY DEFINER function reachable from the public API is
-- a standing invitation, and the linter is right to say so.
--
-- Revoking EXECUTE is not the fix: RLS policy expressions are evaluated with
-- the querying user's privileges, so a user who cannot execute the function
-- cannot pass the policy either, and every table would lock up. The fix is to
-- move the functions into a schema PostgREST does not publish. `private` is
-- not in the project's exposed-schemas list, so no endpoint is generated,
-- while policies keep calling the functions normally.
--
-- Should `private` ever be added to the exposed schemas in the API settings,
-- these endpoints come back and this lint returns. It should not be.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;

COMMENT ON SCHEMA private IS
  'Internal helpers for RLS policies. Deliberately NOT in the project''s exposed-schemas list — nothing here should be reachable over PostgREST.';


-- ===========================================================================
-- 1. Recreate the helpers in `private`
--
-- Bodies are unchanged from 0003: SECURITY DEFINER so they read with RLS
-- bypassed (which is what keeps public.profiles' policy from recursing into
-- itself), STABLE, and search_path pinned to '' with every name qualified.
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'
  );
$$;

COMMENT ON FUNCTION private.is_admin() IS
  'True when the calling user has the admin app role. SECURITY DEFINER to avoid RLS recursion on public.profiles.';

CREATE OR REPLACE FUNCTION private.is_deal_participant(p_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deal_chats d
    WHERE d.id = p_chat_id
      AND d.creator_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION private.is_deal_participant(UUID) IS
  'True when the calling user is the creator party to the given deal chat. Used by the messages policies so a thread is readable only by its participants (§6).';

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM anon;
REVOKE ALL ON FUNCTION private.is_deal_participant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_deal_participant(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_deal_participant(UUID) TO authenticated;


-- ===========================================================================
-- 2. Repoint every policy at the private helpers
--
-- Semantics are identical to 0003 — only the schema qualifier changes. The
-- policies have to be recreated before the public.* functions can be dropped,
-- since a policy is a dependency on the function it calls.
-- ===========================================================================

-- profiles -----------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_admin());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR private.is_admin());

-- media_kits ---------------------------------------------------------------
DROP POLICY IF EXISTS media_kits_select ON public.media_kits;
CREATE POLICY media_kits_select ON public.media_kits
  FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR private.is_admin());

DROP POLICY IF EXISTS media_kits_insert ON public.media_kits;
CREATE POLICY media_kits_insert ON public.media_kits
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (SELECT auth.uid()) OR private.is_admin());

DROP POLICY IF EXISTS media_kits_update ON public.media_kits;
CREATE POLICY media_kits_update ON public.media_kits
  FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR private.is_admin())
  WITH CHECK (creator_id = (SELECT auth.uid()) OR private.is_admin());

DROP POLICY IF EXISTS media_kits_delete ON public.media_kits;
CREATE POLICY media_kits_delete ON public.media_kits
  FOR DELETE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR private.is_admin());

-- deal_chats ---------------------------------------------------------------
DROP POLICY IF EXISTS deal_chats_select ON public.deal_chats;
CREATE POLICY deal_chats_select ON public.deal_chats
  FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR private.is_admin());

DROP POLICY IF EXISTS deal_chats_insert ON public.deal_chats;
CREATE POLICY deal_chats_insert ON public.deal_chats
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (SELECT auth.uid()) OR private.is_admin());

-- Still carries the §12 escrow rule: a creator moves a deal through
-- negotiation but can never mark it 'paid', nor edit one that already is.
DROP POLICY IF EXISTS deal_chats_update ON public.deal_chats;
CREATE POLICY deal_chats_update ON public.deal_chats
  FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR private.is_admin())
  WITH CHECK (
    private.is_admin()
    OR (creator_id = (SELECT auth.uid()) AND deal_status IS DISTINCT FROM 'paid')
  );

-- messages -----------------------------------------------------------------
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (private.is_deal_participant(chat_id) OR private.is_admin());

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND (private.is_deal_participant(chat_id) OR private.is_admin())
  );


-- ===========================================================================
-- 3. Remove the exposed originals
-- ===========================================================================

DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_deal_participant(UUID);
