-- ---------------------------------------------------------------------------
-- Green Light — subscription expiration + promo/trial codes
--
-- A paid plan set by admin/users' updateProfile() (migration 0012) never
-- ended: no expires_at, no fallback to Starter, no self-service trial. This
-- adds both.
--
-- Enforcement lives in requireProfile() (src/lib/auth.ts), not here: it
-- checks subscription_expires_at on every authenticated request and resets
-- an expired paid plan back to Starter via the service-role client. Nothing
-- in this migration needs a trigger or a cron job for that.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.profiles.subscription_expires_at IS
  'When the current paid plan ends. NULL = no expiry (Starter, or a paid plan set with no end date). Same access model as subscription_plan: not user-writable, only the service-role client sets it (admin''s updateProfile(), promo-code redemption, or the automatic expiry reset in requireProfile()).';

CREATE TABLE public.promo_codes (
  code TEXT PRIMARY KEY,
  duration_days INT NOT NULL CHECK (duration_days > 0),
  target_plan TEXT NOT NULL CHECK (target_plan IN ('Pro', 'Elite')),
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.promo_codes IS
  'Single-use trial/promo codes generated at /admin/promo-codes and redeemed from Settings -> Plan & billing. code is the primary key -- it is already unique by construction (system-generated) and every lookup is by code, so a surrogate id would be an unused column. Redemption is one atomic conditional UPDATE (see promo_codes_test.sql) so two callers racing the same code cannot both claim it.';

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy for `authenticated` -- not even an admin SELECT.
-- A code is a bearer credential; both the admin "list codes" view and
-- redemption go through createAdminClient() in server actions, so nothing
-- ever needs to query this table as the browser's own role. Stricter than
-- admin_actions (0012) on purpose.
