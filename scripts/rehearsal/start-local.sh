#!/usr/bin/env bash
# Start a throwaway local Postgres with the harness's Supabase stubs and apply
# migrations up to and including $UPTO (default 0024). Never touches a remote
# database. Prints the env to export. Stop with: pg_ctl -D "$WORK/data" stop
set -euo pipefail
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UPTO="${UPTO:-0024}"
WORK="${WORK:-$(mktemp -d /tmp/glrh.XXXX)}"
PORT="${PG_PORT:-55433}"
RUN=(); if [ "$(id -u)" = 0 ]; then chown -R postgres "$WORK"; RUN=(runuser -u postgres --); fi
"${RUN[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-k $WORK -p $PORT -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
export PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
# Same stubs as scripts/local-migrations-test.sh.
sed -n "/^q <<'SQL'$/,/^SQL$/p" "$ROOT/scripts/local-migrations-test.sh" | sed '1d;$d' | psql -XqAt -v ON_ERROR_STOP=1
for f in "$ROOT"/supabase/migrations/*.sql; do
  n="$(basename "$f" | cut -c1-4)"; [ "$n" \> "$UPTO" ] && break
  psql -XqAt -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "export PGHOST=$WORK PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres"
