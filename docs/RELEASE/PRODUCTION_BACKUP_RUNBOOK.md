# Production backup runbook (owner-operated)

**Status:** prepared and tested end to end against an isolated local Supabase stack on 2026-11-06. **Not yet run against production.** Run it yourself; the assistant does not run it.

**Scripts:**
- `scripts/backup/production-backup.sh`
- `scripts/backup/verify-backup.sh`
- `scripts/backup/restore-isolated.sh` (next stage)

They wrap the commands tested in `ISOLATED_SUPABASE_VALIDATION_REPORT.md` §3, with checks added. Any difference from the earlier tested commands is listed in section 9.

## 1. What the backup contains

| File inside the archive | Produced by | Contains | Does not contain |
|---|---|---|---|
| `roles.sql` | `supabase db dump --role-only` | Custom database roles | Supabase-managed roles, passwords of platform roles |
| `schema.sql` | `supabase db dump` | Schemas `public` and `private`, tables, constraints, indexes, functions, triggers, RLS policies, grants, **default privileges**, extensions (`uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `supabase_vault`) | Definitions of Supabase-managed schemas (`auth`, `storage`, …), which every project already has |
| `data.sql` | `supabase db dump --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes` | Every row of:<br>- `public`;<br>- `auth`: **users with password hashes**, identities, sessions, refresh tokens, MFA, audit log;<br>- `storage`: bucket and object **metadata** | The two empty internal tables above. Without `-x`, the restore fails with `permission denied`. |
| `migration_history.csv` | `\copy (select version, name from supabase_migrations.schema_migrations)` | The applied-migration history. 0024 is absent from it, because it was run in the SQL Editor. | — |
| `counts.txt` | exact `count(*)` per table | The restore baseline: every `public`/`private` table, plus `auth.users`, `auth.identities`, `storage.buckets` and `storage.objects` | — |
| `catalog.txt` | `scripts/rehearsal/catalog-summary.sql` | A fingerprint of columns, constraints, indexes, RLS, policies, grants, column grants, function grants, buckets, publication, functions and triggers | — |
| `SHA256SUMS` | `sha256sum` | A checksum of each file above | — |

**Not in any dump. Record these separately before any change:**
1. **Auth settings,** from Dashboard → Authentication. Write each value down or screenshot it:
   - "Allow new users to sign up";
   - email provider, "Confirm email" and secure email change;
   - Site URL and redirect URLs;
   - minimum password length and requirements;
   - rate limits;
   - custom SMTP (sender only, never the password);
   - email templates;
   - JWT expiry;
   - providers.
2. **Storage file bytes.** Production holds 0 objects (checked 2026-11-03); re-check in Dashboard → Storage. If there are files, download them separately.
3. **Vercel environment variable names** for Production and Preview (Vercel → Settings → Environment Variables). Names and scopes only, never values. The expected names are in `ISOLATED_SUPABASE_VALIDATION_REPORT.md` §2.
4. **Resend and DNS** (sender domain, webhook URL). They are unchanged by a migration, but record them for recovery.

## 2. Prerequisites

| Requirement | Why |
|---|---|
| A trusted computer you control, with full-disk encryption on | The plaintext exists briefly in a temp folder |
| **Docker running** | `supabase db dump` runs `pg_dump` inside a container |
| Supabase CLI. Tested with **2.122.1**: `npm i -g supabase@2.122.1`, or `brew install supabase/tap/supabase` | The dumps |
| `psql` 16 or newer, `gpg` 2.x, `tar`, `sha256sum` (on macOS: `brew install postgresql@16 gnupg coreutils`) | History, counts, encryption |
| A clone of this repository on branch `claude/eager-gauss-dox9tq`, at the commit that adds `scripts/backup/` or later | The scripts |
| The database password (Dashboard → Settings → Database; reset it there if unknown, which does not affect the app's API keys) | The connection |
| A private output folder **outside** any git repository, on the encrypted disk | The script refuses a folder inside a repository |
| A quiet window (no one using the app). Production is low-traffic. | The three dumps are separate snapshots. A write between them shows up as a count mismatch at restore, which is safe but means re-running. |
| A password manager entry ready for the archive passphrase (long and random) | Losing it loses the backup |

**Connection string:** Dashboard → **Connect** → **Session pooler**. It has the form `postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`. Use the Session pooler, not Transaction, and not Direct, which is IPv6-only on Free. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).

## 3. Commands, in order

Every database operation below **only reads**. Nothing writes to production.

```bash
# 0. In the repository, on the trusted computer
cd green-light-analyizer && ls scripts/backup/production-backup.sh   # must exist
docker info >/dev/null && echo docker-ok

# 1. Read the connection string without echoing it or saving it to shell history
read -rs GL_DB_URL && export GL_DB_URL                 # paste, press Enter; nothing is shown

# 2. Run the backup (READ-ONLY on the database). Asks for the archive passphrase twice.
bash scripts/backup/production-backup.sh ~/private/gl-backups

# 3. Verify the archive WITHOUT writing plaintext. Asks for the passphrase.
bash scripts/backup/verify-backup.sh ~/private/gl-backups/gl-backup-<STAMP>.tgz.gpg

# 4. Forget the connection string
unset GL_DB_URL
```

What `production-backup.sh` does, step by step:

| Step | Action | Read-only? |
|---|---|---|
| 1/6 | `supabase db dump --db-url … -f roles.sql --role-only` | Yes |
| 2/6 | `supabase db dump --db-url … -f schema.sql` | Yes |
| 3/6 | `supabase db dump --db-url … -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes` | Yes |
| 4/6 | Export the migration history, exact row counts and the catalog fingerprint (`SELECT` only) | Yes |
| 5/6 | Local sanity checks:<br>- every file is present and non-empty;<br>- `public.profiles`, the `private` schema and the default privileges are in `schema.sql`;<br>- COPY blocks exist for `auth.users`, `auth.identities`, `public.profiles`, `public.messages` and `storage.buckets`;<br>- the excluded tables are absent;<br>- `SHA256SUMS` is written | Local only |
| 6/6 | `tar` the files and stream them into `gpg --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712`, then write the archive's own `.sha256` | Local only |

**Expected output in the folder:** only two files.
- `gl-backup-<UTC stamp>.tgz.gpg`
- `gl-backup-<UTC stamp>.tgz.gpg.sha256`

The plaintext lives only in a private `mktemp` folder, which is overwritten (where `shred` exists) and deleted on exit, even on error.

**Expected output of `verify-backup.sh`:**
- `OK archive checksum`;
- a member list (`roles.sql`, `schema.sql`, `data.sql`, `migration_history.csv`, `counts.txt`, `catalog.txt`, `SHA256SUMS`);
- `OK` with a byte size for each file;
- then `Backup verified.`

It decrypts to a pipe only and never writes plaintext.

## 4. Acceptance criteria

The backup is complete **only** when all of these are true:

1. `production-backup.sh` printed `Backup written:`, exited with status 0, and printed no `ERROR`.
2. `verify-backup.sh` printed `OK archive checksum`, an `OK` line for each of the 6 files, each with a non-zero size, and `Backup verified.`
3. The archive's SHA-256 is recorded somewhere separate from the archive, for example in the password manager entry next to the passphrase.
4. The passphrase is stored in the password manager, and you have opened the entry once to confirm it.
5. The archive is stored outside every git repository and outside any public or shared folder. That excludes shared drives, chat uploads, email and public cloud links. Keep one copy on the encrypted disk and, optionally, a second offline copy, such as an encrypted USB drive.
6. No plaintext remains. `find ~ /tmp -name 'data.sql' -o -name 'roles.sql' -o -name 'schema.sql' 2>/dev/null` shows nothing from this run.

## 5. Encryption and storage

- **Encryption:** symmetric AES-256 with a slow key derivation (`--s2k-count 65011712`, SHA-512). Choose a passphrase of at least 6 random words, or 20+ random characters.
- **Contents:** the archive holds **password hashes, session tokens and personal data**. Treat it like the production database itself:
  - never commit it, attach it to an issue or PR, paste it into chat, or upload it to a shared location;
  - give access to the owner only.
- **Retention:** keep it until production is migrated and verified, plus a reasonable rollback period. Then delete it securely: `shred -u` the file, or delete it from the encrypted disk.

## 6. Cleanup

The script cleans up after itself. Afterwards:
1. Run `unset GL_DB_URL` and close the terminal.
2. If you pasted the connection string anywhere else, delete it.
3. Optionally reset the database password in the dashboard. This does not affect the app, which uses API keys, not this password.
4. If the run was interrupted with `kill -9` (no cleanup), delete any `${TMPDIR:-/tmp}/gl-backup.*` folder: `rm -rf /tmp/gl-backup.*`.

## 7. Failure scenarios

| Symptom | Cause | Fix |
|---|---|---|
| `Docker is not running` | Docker Desktop is stopped | Start Docker and re-run |
| `missing tool: supabase` (or `psql`, `gpg`) | Not installed or not on PATH | Install it (section 2) |
| `is inside a git repository` | The output folder is inside a repository | Choose a folder outside it, such as `~/private/gl-backups` |
| `roles/schema/data dump failed` with `password authentication failed` | Wrong password, or special characters not URL-encoded | Re-enter it; URL-encode it (section 2) |
| `… failed` with `network is unreachable` or a timeout | The direct host is IPv6-only, or a network block | Use the **Session pooler** string; try another network |
| `… failed` mentioning the server version | The CLI's `pg_dump` is older than the server (17.6) | Update the Supabase CLI |
| `data.sql has no COPY for …` | An incomplete dump | Re-run. If it repeats, stop and report it; do not keep a partial backup. |
| `gpg: decryption failed: Bad session key` when verifying | Wrong passphrase | Retry with the stored passphrase. If it is lost, delete the archive and take a new backup. |
| `FAIL <file>` in `verify-backup.sh`, or an archive checksum mismatch | A corrupted or modified archive | Delete it and take a new backup |
| The run is interrupted | — | Nothing was written to production. Delete partial output and any `/tmp/gl-backup.*`, then re-run. |

## 8. Next stage: restore into a fresh, isolated Supabase environment

Do this only after section 4 is complete. **Never** restore into production or `localbasic`; `restore-isolated.sh` refuses both, and refuses any target that already has tables or users.

**Target options** (owner's choice):
- **(a) Local Supabase stack:**
  ```bash
  mkdir ~/gl-restore && cd ~/gl-restore
  supabase init
  supabase start -x vector,imgproxy,supavisor,logflare,realtime,studio,edge-runtime,postgres-meta
  supabase status -o env    # DB_URL
  ```
  Add no migrations: the target must be empty.
- **(b) A hosted throwaway project.** That needs a free slot, by pausing `localbasic`, or a paid plan; both are owner decisions. Use its Session pooler string.

```bash
read -rs GL_TARGET_DB_URL && export GL_TARGET_DB_URL       # the ISOLATED target, never production
bash scripts/backup/restore-isolated.sh ~/private/gl-backups/gl-backup-<STAMP>.tgz.gpg
unset GL_TARGET_DB_URL
```

What it does:
1. Refuses production's or `localbasic`'s project ref, or a target that is not empty.
2. Verifies the archive.
3. Streams, as **one transaction**: `pre-restore.sql`, `roles.sql`, `schema.sql`, `SET session_replication_role = replica`, `data.sql`. Any error rolls everything back. The plaintext goes from `gpg` to `psql` through a pipe and is never written to disk.
4. Compares exact row counts with `counts.txt`, and the security-relevant catalog kinds with `catalog.txt`:
   - columns, constraints, indexes;
   - RLS, policies;
   - grants, column grants, function grants;
   - buckets, publication.
5. Checks that `anon` has no write grant, and that default privileges on new tables exclude `anon`.

**Expected output:** `OK` for row counts and every catalog kind and grant check, then `Restore verified.`

After that, the assistant can run, on the restored copy only:
- migrations 0025–0037, one file per transaction;
- `scripts/rehearsal/post-checks.sql`;
- `supabase/verify/*.sql` and `supabase/tests/*.sql`;
- the Auth, REST and app workflow suites in `scripts/isolated-validation/`.

`post-checks.sql` uses production ids, so it applies unchanged.

### `pre-restore.sql`: what it does and why

```sql
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
```

- **What it revokes:** the fresh project's default privileges, meaning the grants Postgres adds automatically when the role `postgres` creates a table, function or sequence in `public`. It touches nothing that already exists, and it does not affect Supabase-managed schemas or the `supabase_admin` defaults.
- **Why it is needed:** a new Supabase project grants ALL on every new `public` object to `anon`, `authenticated` and `service_role`. A dump contains the source's `GRANT` statements but never the `REVOKE`s that the migrations ran, for example 0004 (no anon table access), 0022 (no client writes to deals and messages) and the column grants on `profiles`.
  - Without this step, the restored tables get the fresh defaults **plus** the dumped grants, and the restore still exits with status 0.
  - Tested: `anon` gained 48 write grants; table grants went from 22 to 36 and column grants from 29 to 96.
  - So a signed-in user could rewrite their own `role`, and `consume_rate_limit` became callable by `anon`.
- **When it must run:** **first**, before `schema.sql` creates any table, in the same transaction. Running it afterwards has no effect on tables already created. `schema.sql` ends with the source's own `ALTER DEFAULT PRIVILEGES`, so production's defaults are re-established for future objects: `authenticated` and `service_role` on tables, no `anon`.
- **Verifying the ACLs:** `restore-isolated.sh` compares the `grant`, `colgrant` and `fnacl` fingerprints with production's (`catalog.txt`), and fails on any difference. It also counts `anon` write grants (must be 0) and checks the default privileges. For a manual spot check, run `scripts/isolated-validation/rest_tests.py` against the restored stack. It confirms through the real REST API that:
  - `anon` reads nothing;
  - a user cannot change `role`, `account_status` or `inbound_alias`;
  - clients cannot insert deals or messages;
  - service-only functions are refused.

## 9. Changes from the commands tested on 2026-11-06

All of the following were re-tested on 2026-11-06 against the isolated stack: backup, verify, restore, the refusals, and a negative control without `pre-restore.sql`.

| Change | Why |
|---|---|
| `--db-url "$GL_DB_URL"` instead of `--local` | It points at the hosted project; same dump code path |
| Added `counts.txt` (exact counts) and `catalog.txt` | So the restore checks itself automatically against production |
| Packed into one `tar` stream piped into `gpg`, with no plaintext tarball | Less plaintext on disk |
| Restore streams the files from `gpg` into a single `psql --single-transaction`, instead of separate `--file` arguments | The same order and transaction, with no plaintext on disk; `SET session_replication_role = replica` is sent as a statement in the stream |
| Guards: no output inside a repository; restore refuses production, `localbasic` and non-empty targets | Prevents the mistakes that would cause harm |

**Test evidence (isolated stack, masked production-shaped data):**
- **Backup:** exit 0; 6 files, all non-empty.
- **Verify:** all `OK`.
- **Verify with a wrong passphrase:** exit 2. **With a tampered archive:** exit 2.
- **Output inside the repository:** refused.
- **Restore:**
  - production URL refused;
  - `localbasic` URL refused;
  - a non-empty target refused;
  - into a fresh stack: row counts identical in 16 tables, all 10 security catalog kinds identical, 0 `anon` write grants, `Restore verified.`;
  - restored users sign in.
- **Negative control** (restore without `pre-restore.sql`): exit 0 but 48 `anon` write grants, and the grant fingerprints differ. The script's checks detect it.
