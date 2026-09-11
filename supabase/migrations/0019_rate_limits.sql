-- ---------------------------------------------------------------------------
-- Green Light — rate limiting for the AI spend paths.
--
-- Four user-triggered actions each spend one NVIDIA call per click, with no
-- ceiling of any kind: the Manual Analyzer (§5.1), Discover's offer preview,
-- the deal room's reply generator (§6) and Media Kit's niche detection. The
-- Analyzer additionally spends a WHOIS lookup and a Safe Browsing call. A held
-- key or a trivial script turns any of them into an unbounded bill.
--
-- Why Postgres rather than an in-memory counter: the app runs on Vercel
-- (§9), where each request may hit a different, short-lived instance. A
-- process-local counter there is not a weak limiter, it is no limiter — it
-- resets constantly and never sees its own siblings. Supabase is already the
-- one piece of shared state this product has, so the counter lives there
-- rather than adding a Redis to a stack §9 says not to substitute.
--
-- Fixed window rather than sliding: a sliding window needs either a row per
-- request or a sorted structure to trim, and this is a cost guard, not a
-- fairness guarantee. The worst case of a fixed window — double the limit
-- across a window boundary — is comfortably within tolerance here.
--
-- The table does not grow without bound and needs no cleanup job: a key is
-- `<action>:<user id>`, so a given user reuses one row per action forever,
-- and each window reset rewrites that same row in place. Row count is bounded
-- by (accounts × actions), not by traffic.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

comment on table public.rate_limits is
  'Fixed-window request counters for cost-bearing actions. One row per (action, subject) key, rewritten in place on each window reset — never grows with traffic. service_role only.';

-- Same posture as oauth_connections and promo_codes: RLS on with no policy at
-- all, which denies every non-service role outright. Nothing client-side has
-- any business reading or writing a quota counter — being able to inspect it
-- would leak usage patterns, and being able to write it would defeat the point.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

/**
 * Consume one unit against `p_key`, returning whether the caller may proceed.
 *
 * Atomic by construction: INSERT ... ON CONFLICT DO UPDATE takes a row lock on
 * the conflicting key, so concurrent callers serialize rather than both
 * reading a stale count and writing the same value back. Doing this as a
 * SELECT-then-UPDATE in application code would let two simultaneous requests
 * each see "n" and each write "n+1", which is precisely the case a limiter
 * exists to stop.
 *
 * SECURITY INVOKER (the default) on purpose: the only caller is the service
 * role, which already bypasses RLS, so DEFINER would add reach without
 * buying anything.
 */
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_started_at, request_count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set
      -- Both branches read the pre-update row, so they stay consistent with
      -- one another: either the window has aged out and this is request 1 of
      -- a new one, or it is still open and the count advances.
      window_started_at = case
        when rl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          then v_now
        else rl.window_started_at
      end,
      request_count = case
        when rl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          then 1
        else rl.request_count + 1
      end
  returning rl.window_started_at, rl.request_count
  into v_window_start, v_count;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    greatest(
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds)) - v_now))::integer,
      0
    );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Atomically consumes one unit against a fixed window and reports whether the caller may proceed. service_role only — see src/lib/rate-limit.ts for the per-action limits.';
