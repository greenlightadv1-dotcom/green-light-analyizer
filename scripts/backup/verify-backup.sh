#!/usr/bin/env bash
# Verify an encrypted Green Light backup without writing any plaintext to disk.
#   bash scripts/backup/verify-backup.sh gl-backup-<stamp>.tgz.gpg
# Decrypts to a pipe only: lists the members, recomputes each member's SHA-256
# from the stream and compares it with the SHA256SUMS stored inside, and checks
# the archive's own .sha256 when present. Prints file names, sizes and verdicts only.
set -euo pipefail
die() { echo "ERROR: $*" >&2; exit 1; }
A="${1:?usage: $0 <archive.tgz.gpg>}"; [ -f "$A" ] || die "no such file: $A"
GPG=(gpg --quiet --decrypt "$A")
[ -n "${GL_BACKUP_PASSFILE:-}" ] && GPG=(gpg --quiet --batch --pinentry-mode loopback --passphrase-file "$GL_BACKUP_PASSFILE" --decrypt "$A")
if [ -f "$A.sha256" ]; then (cd "$(dirname "$A")" && sha256sum -c --quiet "$(basename "$A").sha256") && echo "OK archive checksum"; fi
echo "Members:"; "${GPG[@]}" | tar -tvzf - | awk '{print "  "$3"\t"$6}'
EXPECTED="$("${GPG[@]}" | tar -xzOf - SHA256SUMS)"
fail=0
for f in roles.sql schema.sql data.sql migration_history.csv counts.txt catalog.txt; do
  want="$(printf '%s\n' "$EXPECTED" | awk -v f="$f" '$2==f{print $1}')"
  got="$("${GPG[@]}" | tar -xzOf - "$f" | sha256sum | cut -d' ' -f1)"
  size="$("${GPG[@]}" | tar -xzOf - "$f" | wc -c)"
  if [ -n "$want" ] && [ "$want" = "$got" ] && [ "$size" -gt 0 ]; then echo "OK   $f ($size bytes)"; else echo "FAIL $f"; fail=1; fi
done
[ "$fail" = 0 ] && echo "Backup verified." || die "backup verification failed"
