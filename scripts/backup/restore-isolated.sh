#!/usr/bin/env bash
# Restore an encrypted Green Light backup into a FRESH, EMPTY, ISOLATED Supabase database,
# then verify it against the backup's own baseline. Never use on production.
#
#   read -rs GL_TARGET_DB_URL && export GL_TARGET_DB_URL
#   bash scripts/backup/restore-isolated.sh gl-backup-<stamp>.tgz.gpg
#
# Order (tested 2026-11-06): pre-restore.sql, roles.sql, schema.sql,
# SET session_replication_role = replica, data.sql, all in ONE transaction, so
# any error leaves the target untouched. Plaintext is streamed from gpg straight
# into psql and never written to disk.
set -euo pipefail
die() { echo "ERROR: $*" >&2; exit 1; }
A="${1:?usage: $0 <archive.tgz.gpg>}"; [ -f "$A" ] || die "no such file: $A"
[ -n "${GL_TARGET_DB_URL:-}" ] || die "GL_TARGET_DB_URL is not set"
HERE="$(cd "$(dirname "$0")" && pwd)"
# Hard refusals: the production project and the unrelated localbasic project.
case "$GL_TARGET_DB_URL" in *kpuecrvdrkhemyvibyfa*) die "target is the PRODUCTION project; refusing";; *sztwmzwoxogxyabipwyo*) die "target is localbasic (unrelated application); refusing";; esac
q() { psql "$GL_TARGET_DB_URL" -XqAt -v ON_ERROR_STOP=1 "$@"; }
n="$(q -c "select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname in ('public','private') and c.relkind='r'")"
[ "$n" = 0 ] || die "target already has $n tables in public/private; restore only into a fresh, empty project"
[ "$(q -c "select count(*) from auth.users")" = 0 ] || die "target already has auth users; restore only into a fresh, empty project"

GPG=(gpg --quiet --decrypt "$A")
[ -n "${GL_BACKUP_PASSFILE:-}" ] && GPG=(gpg --quiet --batch --pinentry-mode loopback --passphrase-file "$GL_BACKUP_PASSFILE" --decrypt "$A")
member() { "${GPG[@]}" | tar -xzOf - "$1"; }

echo "1/4 verify archive"
bash "$HERE/verify-backup.sh" "$A" >/dev/null || die "archive failed verification"
echo "2/4 restore (single transaction)"
{ cat "$HERE/../rehearsal/pre-restore.sql"; member roles.sql; member schema.sql; echo "SET session_replication_role = replica;"; member data.sql; } \
  | psql "$GL_TARGET_DB_URL" -Xq -v ON_ERROR_STOP=1 --single-transaction -f - > /dev/null || die "restore failed; the transaction rolled back and the target is unchanged"

echo "3/4 compare row counts and catalog with the backup"
q -F'|' -f - > "${TMPDIR:-/tmp}/gl-restore-counts.$$" <<'SQL'
select format('select %L, count(*) from %I.%I', n.nspname||'.'||c.relname, n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and (n.nspname in ('public', 'private') or (n.nspname, c.relname) in (('auth','users'), ('auth','identities'), ('storage','buckets'), ('storage','objects')))
 order by 1 \gexec
SQL
fail=0
if diff <(member counts.txt) "${TMPDIR:-/tmp}/gl-restore-counts.$$" >/dev/null; then echo "OK   row counts identical ($(wc -l < "${TMPDIR:-/tmp}/gl-restore-counts.$$") tables)"; else echo "FAIL row counts differ:"; diff <(member counts.txt) "${TMPDIR:-/tmp}/gl-restore-counts.$$" | sed 's/^/     /'; fail=1; fi
rm -f "${TMPDIR:-/tmp}/gl-restore-counts.$$"
CAT="$(q -F' ' -f "$HERE/../rehearsal/catalog-summary.sql")"
# fn/trg may differ only by Supabase's own storage triggers and comment text; every security-relevant kind must match.
for k in col con idx rls pol grant colgrant fnacl bucket pub; do
  a="$(member catalog.txt | awk -v k="$k" '$1==k')"; b="$(printf '%s\n' "$CAT" | awk -v k="$k" '$1==k')"
  if [ "$a" = "$b" ]; then echo "OK   catalog $k"; else echo "FAIL catalog $k: backup [$a] restored [$b]"; fail=1; fi
done

echo "4/4 client write grants (must be none beyond what the source had)"
W="$(q -c "select count(*) from information_schema.role_table_grants where table_schema in ('public','private') and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')")"
[ "$W" = 0 ] && echo "OK   anon has no write grant on any public/private table" || { echo "FAIL anon has $W write grants"; fail=1; }
D="$(q -c "select coalesce(string_agg(d.defaclacl::text, ' '), '') from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where pg_get_userbyid(d.defaclrole)='postgres' and n.nspname='public' and d.defaclobjtype='r'")"
case "$D" in *anon=*) echo "FAIL default privileges give anon new tables: $D"; fail=1;; *) echo "OK   default privileges on new public tables exclude anon";; esac
[ "$fail" = 0 ] && echo "Restore verified." || die "restore verification failed"
