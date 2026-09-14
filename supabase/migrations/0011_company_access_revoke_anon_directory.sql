-- Supabase grants EXECUTE on every new public-schema function to anon,
-- authenticated and service_role by default privilege — a direct grant to
-- each role, not through the PUBLIC pseudo-role, so `revoke all from public`
-- in 0010 did not touch it. creator_directory() already returns zero rows
-- for a caller who isn't company/admin (it checks auth.uid() itself), so
-- this was not a data leak — anon has no auth.uid() match, ever. Revoking
-- anyway removes the anonymous RPC surface entirely rather than relying on
-- the function body to keep saying no.
revoke execute on function public.creator_directory() from anon;
