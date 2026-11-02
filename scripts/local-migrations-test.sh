#!/usr/bin/env bash
# Apply every migration in supabase/migrations to a throwaway local Postgres,
# re-apply the idempotent ones, and run supabase/tests/*.sql plus the
# supabase/verify/*.sql checks. Never touches a remote database: it creates
# its own cluster under a temporary directory and deletes it on exit.
#
#   bash scripts/local-migrations-test.sh
#
# Needs PostgreSQL 16 server binaries (initdb, pg_ctl) and the uuid-ossp
# extension. The stubs below stand in for what Supabase provides (auth.uid(),
# auth.users, storage.buckets/objects, the realtime publication, and the
# anon / authenticated / service_role roles with Supabase's default grants).
# They are not the real Supabase services, so a pass here does not replace
# running supabase/verify/*.sql against the real project.
set -euo pipefail

BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d /tmp/glpg.XXXX)"   # short path: Unix socket names are length-limited
PORT="${PG_PORT:-55432}"
cleanup() { "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# initdb refuses to run as root; use the postgres OS user when we are root.
RUN=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$WORK"; RUN=(runuser -u postgres --); fi

"${RUN[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-k $WORK -p $PORT -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
export PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
q() { psql -XqAt -v ON_ERROR_STOP=1 "$@"; }

q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  encrypted_password text, created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create publication supabase_realtime;
SQL

pass=0; fail=0
step() { if "$@" >"$WORK/out" 2>&1; then echo "PASS $LABEL"; pass=$((pass+1)); else echo "FAIL $LABEL"; sed 's/^/    /' "$WORK/out" | tail -15; fail=$((fail+1)); fi; }

for f in "$ROOT"/supabase/migrations/*.sql; do
  LABEL="apply $(basename "$f")" step q -f "$f"
done
for f in "$ROOT"/supabase/migrations/0024_*.sql "$ROOT"/supabase/migrations/0025_*.sql "$ROOT"/supabase/migrations/0026_*.sql "$ROOT"/supabase/migrations/0027_*.sql; do
  LABEL="re-apply $(basename "$f") (idempotent)" step q -f "$f"
done
for f in "$ROOT"/supabase/tests/*.sql; do
  LABEL="test $(basename "$f")" step q -f "$f"
done
for f in "$ROOT"/supabase/verify/*.sql; do
  LABEL="verify $(basename "$f")" step bash -c "psql -XqAt -v ON_ERROR_STOP=1 -F'|' -f '$f' | tee /dev/stderr | grep -q '|f$' && exit 1 || exit 0"
done

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
