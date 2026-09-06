-- ---------------------------------------------------------------------------
-- Green Light — forced password reset on first login (§4.2)
--
-- The §10 schema has no field to hang this on, so it is added here as a
-- migration rather than by editing 0001 in place.
--
-- The authoritative flag lives in `auth.users.raw_app_meta_data` (app_metadata),
-- because a user CAN write their own user_metadata and would therefore be able
-- to clear a flag stored there and skip the reset. app_metadata is writable
-- only by the service role. The column below mirrors it for admin listing and
-- for RLS policies that may need it; it is never the thing that is trusted.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Mirror of auth.users.raw_app_meta_data->>''must_change_password''. Display/admin use only — the guard in middleware reads app_metadata, which the user cannot write.';
