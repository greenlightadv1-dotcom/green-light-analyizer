# CI

`ci.yml` runs on every push and pull request: typecheck, lint, the unit suite,
a production build, and the webhook end-to-end script against the built app.

Everything here runs on placeholder values. That works because no secret in
this project is read at build time — they are all read per request — so CI
never needs a real key, and a leaked CI log never contains one.

## Not wired up: the database suites

`supabase/tests/*.sql` need a live Postgres with the migrations applied. They
are the strongest tests in the repo — they are what proves RLS actually
isolates creators rather than merely being switched on — so they are worth
adding once someone decides where they should run:

- **Supabase branch database** (preview branches on a paid plan), or
- **A local `supabase start`** in CI with the migrations applied in order.

Until then, run them by hand against the project before a release:

```bash
for f in supabase/tests/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Every row must read PASS.
