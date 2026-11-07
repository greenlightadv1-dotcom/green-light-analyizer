#!/usr/bin/env bash
# Green Light: production database backup (read-only against the database).
#
#   GL_DB_URL=... bash scripts/backup/production-backup.sh <output-dir-outside-the-repo>
#
# GL_DB_URL is the Session pooler connection string from the Supabase dashboard
# (Connect → Session pooler). Read it into the variable without echoing it:
#   read -rs GL_DB_URL && export GL_DB_URL
# The script never prints it, never takes it as an argument, and never writes it to disk.
#
# Every database operation here only reads: pg_dump (via `supabase db dump`),
# one SELECT exported with \copy, exact row counts and a catalog fingerprint. Output: one encrypted archive,
# gl-backup-<UTC stamp>.tgz.gpg, plus its .sha256. The plaintext files exist
# only inside a private temporary directory and are deleted before exit.
set -euo pipefail
umask 077

die() { echo "ERROR: $*" >&2; exit 1; }
[ $# -eq 1 ] || die "usage: GL_DB_URL=... $0 <output-dir>"
[ -n "${GL_DB_URL:-}" ] || die "GL_DB_URL is not set (read it with: read -rs GL_DB_URL && export GL_DB_URL)"
for t in supabase psql gpg tar sha256sum docker; do command -v "$t" >/dev/null || die "missing tool: $t"; done
docker info >/dev/null 2>&1 || die "Docker is not running (supabase db dump runs pg_dump in a container)"

OUT="$(mkdir -p "$1" && cd "$1" && pwd -P)"
# Refuse an output directory inside any git working tree, so a dump can never be committed.
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then die "$OUT is inside a git repository; choose a private directory outside it"; fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/gl-backup.XXXXXX")"
cleanup() { if command -v shred >/dev/null; then find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true; fi; rm -rf "$WORK"; }
trap cleanup EXIT

echo "1/6 roles"
supabase db dump --db-url "$GL_DB_URL" -f "$WORK/roles.sql" --role-only >"$WORK/.log" 2>&1 || { sed 's/postgres[^ ]*@[^ ]*/<redacted>/g' "$WORK/.log" >&2; die "roles dump failed"; }
echo "2/6 schema"
supabase db dump --db-url "$GL_DB_URL" -f "$WORK/schema.sql" >"$WORK/.log" 2>&1 || { sed 's/postgres[^ ]*@[^ ]*/<redacted>/g' "$WORK/.log" >&2; die "schema dump failed"; }
echo "3/6 data (all of public, auth and storage, minus two empty internal tables the restore cannot write)"
supabase db dump --db-url "$GL_DB_URL" -f "$WORK/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes >"$WORK/.log" 2>&1 || { sed 's/postgres[^ ]*@[^ ]*/<redacted>/g' "$WORK/.log" >&2; die "data dump failed"; }
echo "4/6 migration history and baseline counts"
psql "$GL_DB_URL" -XqAt -v ON_ERROR_STOP=1 -c "\copy (select version, name from supabase_migrations.schema_migrations order by version) to '$WORK/migration_history.csv' csv header" \
  || die "migration history export failed"
# Exact row counts (not pg_stat estimates) and the catalog fingerprint, both read-only.
psql "$GL_DB_URL" -XqAt -v ON_ERROR_STOP=1 -F'|' -f - > "$WORK/counts.txt" <<'SQL' || die "baseline counts failed"
select format('select %L, count(*) from %I.%I', n.nspname||'.'||c.relname, n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and (n.nspname in ('public', 'private') or (n.nspname, c.relname) in (('auth','users'), ('auth','identities'), ('storage','buckets'), ('storage','objects')))
 order by 1 \gexec
SQL
psql "$GL_DB_URL" -XqAt -v ON_ERROR_STOP=1 -F' ' -f "$(dirname "$0")/../rehearsal/catalog-summary.sql" > "$WORK/catalog.txt" || die "catalog fingerprint failed"
rm -f "$WORK/.log"

echo "5/6 sanity checks"
for f in roles.sql schema.sql data.sql migration_history.csv counts.txt catalog.txt; do [ -s "$WORK/$f" ] || die "$f is missing or empty"; done
grep -q 'CREATE TABLE IF NOT EXISTS "public"."profiles"' "$WORK/schema.sql" || die "schema.sql has no public.profiles"
grep -q 'CREATE SCHEMA IF NOT EXISTS "private"' "$WORK/schema.sql" || die "schema.sql has no private schema"
grep -q 'ALTER DEFAULT PRIVILEGES' "$WORK/schema.sql" || die "schema.sql has no default privileges"
for t in '"auth"."users"' '"auth"."identities"' '"public"."profiles"' '"public"."messages"' '"storage"."buckets"'; do
  grep -q "^COPY $t" "$WORK/data.sql" || die "data.sql has no COPY for $t"
done
grep -qE '^COPY "storage"\."(buckets_vectors|vector_indexes)"' "$WORK/data.sql" && die "data.sql still contains an excluded table"
(cd "$WORK" && sha256sum roles.sql schema.sql data.sql migration_history.csv counts.txt catalog.txt > SHA256SUMS)

echo "6/6 encrypt (gpg will ask for a passphrase twice; store it in a password manager)"
ARCHIVE="$OUT/gl-backup-$STAMP.tgz.gpg"
GPG=(gpg --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 -o "$ARCHIVE")
[ -n "${GL_BACKUP_PASSFILE:-}" ] && GPG=(gpg --batch --yes --pinentry-mode loopback --passphrase-file "$GL_BACKUP_PASSFILE" --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 -o "$ARCHIVE")
tar -C "$WORK" -czf - roles.sql schema.sql data.sql migration_history.csv counts.txt catalog.txt SHA256SUMS | "${GPG[@]}"
(cd "$OUT" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256")

echo
echo "Backup written: $ARCHIVE"
echo "Archive checksum: $(cut -d' ' -f1 "$ARCHIVE.sha256")"
echo "Plaintext files are deleted on exit. Verify with: bash scripts/backup/verify-backup.sh '$ARCHIVE'"
