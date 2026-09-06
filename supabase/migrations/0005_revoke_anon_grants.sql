-- ---------------------------------------------------------------------------
-- Green Light — withdraw the anon role's table grants
--
-- STATUS: APPLIED to project ref kpuecrvdrkhemyvibyfa.
--
-- Supabase grants `anon` full DML on every new table in `public` by default,
-- and relies on RLS to make that harmless. It is harmless today: no policy on
-- any of these four tables is scoped TO anon, so an unauthenticated caller
-- reads nothing and writes nothing. The RLS test asserts exactly that.
--
-- But that safety rests entirely on RLS staying switched on. One
-- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` — during a debugging session, a
-- migration written in a hurry, a restore from a dump taken before 0003 — and
-- the standing grant means the anon key can read every creator's real email
-- and write to every deal thread. The grant is the loaded half of that; RLS is
-- only the safety catch.
--
-- Nothing in the product ever touches these tables as `anon`. Every read
-- happens after sign-in (role `authenticated`) or from the server
-- (`service_role`), so there is nothing to trade away by removing them.
--
-- This is defence in depth, not a lint fix: the Supabase linter was already
-- clean before this migration and is unaffected by it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.profiles   FROM anon;
REVOKE ALL ON public.media_kits FROM anon;
REVOKE ALL ON public.deal_chats FROM anon;
REVOKE ALL ON public.messages   FROM anon;

-- Stop the same default from re-arming on tables added by future migrations.
-- Applies to objects created by the role that owns the migration connection.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
