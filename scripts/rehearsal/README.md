# Migration rehearsal (local only)

Rehearses migrations 0025–0037 on a throwaway local Postgres with production-shaped data. Never connects to a remote database.

1. `WORK=$(mktemp -d /tmp/glrh.XXXX) bash scripts/rehearsal/start-local.sh` builds 0001–0024 with the harness's Supabase stubs and prints the `PG*` variables to export.
2. On production (read-only), `catalog-summary.sql` is compared with the same query on the rebuild to prove the schemas match. `catalog-fingerprint.sql` lists per object if they differ.
3. `export-masked.sql`, run read-only on production, returns ids, foreign keys, states and timestamps. Personal data and secrets are masked inside the query. Load the result as a fixture. Keep it out of the repository.
4. `pg_dump -Fc` the rebuild (the recovery point), then `psql -f baseline.sql`.
5. Apply 0025–0037 in order, then `psql -f post-checks.sql`. The ids in it are production's, and they carry no personal data.
6. Recovery: `pg_restore` the dump into a new database, and compare the checksums with the baseline.

The results of the 2026-11-03 run are in `docs/RELEASE/PRE_DEPLOYMENT_SAFETY_REPORT.md`.
