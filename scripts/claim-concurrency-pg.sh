#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Real-Postgres check of the two database behaviours the inbound claim relies
# on (src/lib/email/claim.ts). The unit tests use an in-memory store, which
# can only *assume* these; this runs them against Postgres with two concurrent
# sessions:
#
#   1. Two INSERTs of the same provider_message_id: one wins, the other gets
#      23505 (unique_violation) after waiting for the first to commit.
#   2. Two compare-and-swap UPDATEs of the same row
#        UPDATE … SET detail = $new WHERE provider_message_id = $1
#          AND status = 'failed' AND detail = $old RETURNING id
#      (what supabase-js sends for .update().eq().eq().eq().select()): the
#      second waits on the first's row lock, re-checks its WHERE clause against
#      the committed row, and changes nothing.
#   3. The same race when the first transaction rolls back: the second then
#      succeeds, so an aborted takeover never strands the claim.
#
# It works in its own throwaway schema, mirroring inbound_emails' key, status
# CHECK and detail column, and drops it afterwards. It never reads or writes
# the application's tables. Refuses non-local databases unless
# CLAIM_PROBE_ALLOW_REMOTE=1.
#
#   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres \
#     bash scripts/claim-concurrency-pg.sh
#
# What it does not cover: PostgREST's translation of the supabase-js call
# into that SQL (taken from PostgREST's documented behaviour, not run here).
# ---------------------------------------------------------------------------
set -u

: "${DATABASE_URL:?set DATABASE_URL to a local, throwaway Postgres}"
case "$DATABASE_URL" in
  *@127.0.0.1*|*@localhost*|*@\[::1\]*|*host=/*|*host=%2F*) ;;
  *) [ "${CLAIM_PROBE_ALLOW_REMOTE:-}" = 1 ] || { echo "refusing a non-local database (set CLAIM_PROBE_ALLOW_REMOTE=1 to override)"; exit 2; } ;;
esac

S="claim_probe_$$"
T="$S.inbound_emails"
WORK="$(mktemp -d)"
trap 'psql "$DATABASE_URL" -XqAt -c "drop schema if exists $S cascade" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
q() { psql "$DATABASE_URL" -XqAt -v ON_ERROR_STOP=1 "$@"; }

q -c "create schema $S;
      create table $T (
        id serial primary key,
        provider_message_id text not null unique,
        status text not null check (status in ('processed','unknown_alias','rejected','failed')),
        detail text);" || exit 1

pass=0; fail=0
ms() { echo $(( $(date +%s%N) / 1000000 )); }
# The racing session must have *waited* on the first one's lock; otherwise it
# merely ran afterwards and the check proves nothing about concurrency.
waited() { [ $(( $2 - $1 )) -ge 800 ] && echo yes || echo "no ($(( $2 - $1 ))ms)"; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi; }

# 1. concurrent first claims ------------------------------------------------
q -c "begin; insert into $T (provider_message_id,status,detail) values ('k1','failed','processing since A'); select pg_sleep(1.5); commit;" > "$WORK/1a" 2>&1 &
sleep 0.4
t0=$(ms)
psql "$DATABASE_URL" -XqAt -c "insert into $T (provider_message_id,status,detail) values ('k1','failed','processing since B')" > "$WORK/1b" 2>&1
t1=$(ms)
wait
check "second INSERT blocked on the first" "yes" "$(waited "$t0" "$t1")"
check "second concurrent INSERT is a unique violation" "yes" "$(grep -q 'duplicate key value violates unique constraint' "$WORK/1b" && echo yes || echo no)"
check "the first claim stands" "processing since A" "$(q -c "select detail from $T where provider_message_id='k1'")"

# 2. concurrent compare-and-swap, first commits -------------------------------
q -c "insert into $T (provider_message_id,status,detail) values ('k2','failed','processing since 2026-01-01T00:00:00.000Z')"
CAS="update $T set detail = :'new' where provider_message_id = 'k2' and status = 'failed' and detail = 'processing since 2026-01-01T00:00:00.000Z' returning id"
q -v new='processing since A' <<SQL > "$WORK/2a" 2>&1 &
begin;
$CAS;
select pg_sleep(1.5);
commit;
SQL
sleep 0.4
t0=$(ms)
echo "$CAS;" | q -v new='processing since B' > "$WORK/2b" 2>&1
t1=$(ms)
wait
check "second CAS blocked on the first's row lock" "yes" "$(waited "$t0" "$t1")"
check "first CAS changed the row" "1" "$(grep -c '^[0-9]\+$' "$WORK/2a")"
check "second CAS, after waiting, changed nothing" "0" "$(grep -c '^[0-9]\+$' "$WORK/2b")"
check "row holds the winner's marker" "processing since A" "$(q -c "select detail from $T where provider_message_id='k2'")"

# 3. concurrent compare-and-swap, first rolls back ----------------------------
q -c "insert into $T (provider_message_id,status,detail) values ('k3','failed','content fetch failed: HTTP 503')"
CAS3="update $T set detail = :'new' where provider_message_id = 'k3' and status = 'failed' and detail = 'content fetch failed: HTTP 503' returning id"
q -v new='processing since A' <<SQL > "$WORK/3a" 2>&1 &
begin;
$CAS3;
select pg_sleep(1.5);
rollback;
SQL
sleep 0.4
t0=$(ms)
echo "$CAS3;" | q -v new='processing since B' > "$WORK/3b" 2>&1
t1=$(ms)
wait
check "second CAS blocked until the rollback" "yes" "$(waited "$t0" "$t1")"
check "after a rollback the waiting CAS succeeds" "1" "$(grep -c '^[0-9]\+$' "$WORK/3b")"
check "row holds the second marker" "processing since B" "$(q -c "select detail from $T where provider_message_id='k3'")"

echo "  $pass passed, $fail failed"
[ "$fail" = 0 ]
