-- ---------------------------------------------------------------------------
-- Green Light — Row Level Security policies
--
-- STATUS: APPLIED to project ref kpuecrvdrkhemyvibyfa.
-- SUPERSEDED IN PART by 0004_rls_helper_schema.sql, which moves is_admin() and
-- is_deal_participant() from `public` to `private` (in `public` they were
-- published as PostgREST RPC endpoints) and repoints every policy below at the
-- new schema. The policy logic is unchanged; only the schema qualifier moved.
-- Read this file for the reasoning, 0004 for the shipping definitions.
--
-- Completes the TODO left in 0001_init.sql and satisfies the §12 requirement
-- that RLS be enforced on every table holding user or deal data.
--
-- Model
-- -----
--   creator/company  -> may touch only their own rows, through a narrowed set
--                       of columns (see "Column privileges" below)
--   admin (app role) -> full row access via public.is_admin()
--   service_role     -> bypasses RLS entirely (Postgres BYPASSRLS). This is the
--                       identity the server uses for account creation, the
--                       inbound-email webhook and the OAuth analytics sync.
--   anon             -> nothing. Every policy is scoped TO authenticated, so an
--                       unauthenticated caller matches no policy on any table.
--
-- Two notes on what RLS can and cannot do here:
--
--   1. Row policies gate WHICH ROWS you touch, never WHICH COLUMNS. Left at
--      row level alone, "a creator may update their own profile" also means
--      "a creator may set their own role to admin" and "a creator may set
--      audience_verified = true". Both destroy the product: the first is
--      privilege escalation, the second forges the verified-audience badge
--      that §1 and §7.2 exist to make trustworthy. Column privileges below
--      close that gap; the policies alone would not.
--
--   2. RLS cannot enforce that message text passed through the §6.1 mask.
--      That remains the server's job in src/lib/mask.ts, before the insert.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Helper functions
--
-- Both are SECURITY DEFINER so they read their tables with RLS bypassed. That
-- is what stops public.profiles' own policy from recursing into itself when it
-- asks "is the caller an admin?". search_path is pinned to '' and every name
-- is schema-qualified, so the definer's rights cannot be redirected by a
-- caller-controlled search_path.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
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

COMMENT ON FUNCTION public.is_admin() IS
  'True when the calling user has the admin app role. SECURITY DEFINER to avoid RLS recursion on public.profiles.';

CREATE OR REPLACE FUNCTION public.is_deal_participant(p_chat_id UUID)
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

COMMENT ON FUNCTION public.is_deal_participant(UUID) IS
  'True when the calling user is the creator party to the given deal chat. Used by the messages policies so a thread is readable only by its participants (§6).';

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_deal_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_deal_participant(UUID) TO authenticated;


-- ===========================================================================
-- 2. Enable RLS everywhere
--
-- profiles and deal_chats already had it on since 0001; media_kits and
-- messages did not, and were fully readable and writable by anyone holding
-- the anon key. These two statements are the actual fix for that.
-- ===========================================================================

ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages   ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 3. Column privileges
--
-- Table-level INSERT/UPDATE is withdrawn from `authenticated` and re-granted
-- only on the columns a user may legitimately set. service_role keeps its full
-- grants, so every server-side path (admin account creation, the inbound-email
-- webhook, the OAuth analytics sync) is unaffected.
--
-- Postgres does not subtract a column grant from a table-level one, so the
-- REVOKE has to come first for the GRANT that follows to be the real ceiling.
-- ===========================================================================

-- profiles -----------------------------------------------------------------
-- No INSERT at all: accounts exist only because an admin created one (§4.1),
-- and that path runs as service_role. Of the remaining columns a user may
-- edit only their display name. role is withheld because writing it would be
-- straight privilege escalation; subscription_plan because upgrades are
-- settled over Discord, not by the client (§4.3); inbound_alias, region and
-- primary_email because they are issued, not chosen.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- media_kits ---------------------------------------------------------------
-- The verified/declared split from §7.2 is enforced here, not by convention.
-- A creator may write their own declared_top_countries and their basic reach
-- figures. They may NOT write verified_top_countries, audience_verified or
-- analytics_oauth_connected: those may only ever be set by the server after a
-- real Analytics/Insights API sync. If a creator could set them, the "verified"
-- badge would be self-reported data wearing a verified label — precisely the
-- screenshot fraud this product exists to kill (§1, §7.2).
REVOKE INSERT, UPDATE, DELETE ON public.media_kits FROM authenticated;
GRANT INSERT (
  id, creator_id, platform, avg_views, avg_ccv, engagement_rate,
  content_category, content_language, declared_top_countries
) ON public.media_kits TO authenticated;
GRANT UPDATE (
  avg_views, avg_ccv, engagement_rate,
  content_category, content_language, declared_top_countries
) ON public.media_kits TO authenticated;
GRANT DELETE ON public.media_kits TO authenticated;

-- deal_chats ---------------------------------------------------------------
-- A creator may open a room from the manual analyzer (§5.1) and move it along
-- the negotiation. ai_evaluation and offered_amount are withheld: the risk
-- rating is the platform's verdict, not the creator's, and the amount is what
-- the company offered. Both are written by the server. No DELETE — a deal that
-- can reach 'disputed' must leave a record.
REVOKE INSERT, UPDATE, DELETE ON public.deal_chats FROM authenticated;
GRANT INSERT (
  id, creator_id, company_id, sender_email,
  sponsorship_type, target_countries
) ON public.deal_chats TO authenticated;
GRANT UPDATE (deal_status, sponsorship_type, target_countries)
  ON public.deal_chats TO authenticated;

-- messages -----------------------------------------------------------------
-- Insert-only for users. No UPDATE and no DELETE: a thread that can be edited
-- after the fact is worthless as dispute evidence, and is_masked must stay the
-- server's answer about what the §6.1 filter did, not something the sender can
-- flip. Admin correction, if ever needed, goes through service_role.
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM authenticated;
GRANT INSERT (id, chat_id, sender_id, message_text) ON public.messages TO authenticated;


-- ===========================================================================
-- 4. Policies
--
-- One policy per (table, command) rather than separate owner and admin
-- policies, so that only a single permissive policy is ever evaluated per
-- command. auth.uid() is wrapped in a scalar subquery so the planner evaluates
-- it once per statement instead of once per row.
-- ===========================================================================

-- profiles -----------------------------------------------------------------
-- Own row only. This is what keeps a creator's primary_email and inbound_alias
-- away from companies (§6, §12): a company is not an admin and the row is not
-- theirs, so no policy admits the read at all. That is a stronger guarantee
-- than omitting the column from a client query, which the client controls.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

-- media_kits ---------------------------------------------------------------
DROP POLICY IF EXISTS media_kits_select ON public.media_kits;
CREATE POLICY media_kits_select ON public.media_kits
  FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS media_kits_insert ON public.media_kits;
CREATE POLICY media_kits_insert ON public.media_kits
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS media_kits_update ON public.media_kits;
CREATE POLICY media_kits_update ON public.media_kits
  FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (creator_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS media_kits_delete ON public.media_kits;
CREATE POLICY media_kits_delete ON public.media_kits
  FOR DELETE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR public.is_admin());

-- deal_chats ---------------------------------------------------------------
-- Thread isolation: a room is visible only to the creator it was assigned to,
-- or to an admin.
DROP POLICY IF EXISTS deal_chats_select ON public.deal_chats;
CREATE POLICY deal_chats_select ON public.deal_chats
  FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS deal_chats_insert ON public.deal_chats;
CREATE POLICY deal_chats_insert ON public.deal_chats
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (SELECT auth.uid()) OR public.is_admin());

-- The WITH CHECK clause carries the §12 escrow rule: settlement is reconciled
-- manually by an admin, so a creator can move a deal through negotiation but
-- can never mark it 'paid' themselves, nor edit a deal that already is.
DROP POLICY IF EXISTS deal_chats_update ON public.deal_chats;
CREATE POLICY deal_chats_update ON public.deal_chats
  FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (creator_id = (SELECT auth.uid()) AND deal_status IS DISTINCT FROM 'paid')
  );

-- messages -----------------------------------------------------------------
-- Readable only by a party to the parent thread. Insertable only as yourself,
-- and only into a thread you are a party to — so a chat_id guessed or scraped
-- from elsewhere buys nothing.
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_deal_participant(chat_id) OR public.is_admin());

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND (public.is_deal_participant(chat_id) OR public.is_admin())
  );


-- ===========================================================================
-- 5. Indexes backing the policies
--
-- Every policy above filters on one of these columns, so without them each
-- check is a sequential scan.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS media_kits_creator_id_idx ON public.media_kits (creator_id);
CREATE INDEX IF NOT EXISTS deal_chats_creator_id_idx ON public.deal_chats (creator_id);
CREATE INDEX IF NOT EXISTS deal_chats_company_id_idx ON public.deal_chats (company_id);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx       ON public.messages (chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx     ON public.messages (sender_id);


-- ===========================================================================
-- 6. Deliberately NOT granted — read before adding company access
--
-- The `company` role has no policy on any table here, so a signed-in company
-- account currently reads nothing. That is intentional and is the safe
-- direction to be wrong in, but it does mean the company-side inbox is empty
-- until this is designed properly.
--
-- When it is, do NOT solve it by adding `company_id = auth.uid()` to
-- profiles_select. deal_chats and messages can take that treatment; profiles
-- cannot, because one such policy hands companies whole creator rows including
-- primary_email and inbound_alias, which §6 and §12 make a hard security
-- boundary rather than a UI convention.
--
-- The shape that works is a column-limited creator directory — full_name,
-- region, subscription_plan and the media_kits stats, and nothing else —
-- exposed with security_invoker = on so it is still governed by RLS rather
-- than defeating it. A SECURITY DEFINER view here would bypass every policy
-- above and would also be flagged by the Supabase linter.
-- ===========================================================================
