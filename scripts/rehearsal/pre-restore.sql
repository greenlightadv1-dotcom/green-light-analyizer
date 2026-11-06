-- Run on the EMPTY restore target, before roles.sql / schema.sql / data.sql.
-- A fresh Supabase project grants ALL on every new public table, function and
-- sequence to anon/authenticated/service_role by default. pg_dump emits only
-- the source's GRANTs, never REVOKEs, so without this step the restored
-- database silently widens every grant the migrations narrowed (column grants
-- on profiles, 0022's server-only deal writes, service-role-only functions).
-- schema.sql re-creates the source's default privileges at its end.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
