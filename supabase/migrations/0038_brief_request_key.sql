-- ===========================================================================
-- 0038: Idempotent brief creation (one request key = at most one brief)
-- ===========================================================================
--
-- WHY
--   A company can create a brief from the /briefs/new form or from a draft G
--   prepared. Both go through the server action saveBrief, which inserts a
--   new row each time it is called. The UI stops a second click, but a
--   retried network request, a replayed request or two concurrent submissions
--   of the same form could each insert a draft (reproduced on the isolated
--   stack by replaying the captured request; see docs/G/G_ACCEPTANCE_REPORT.md).
--
-- WHAT
--   briefs.request_key: a uuid the client sends with each creation. It is
--   generated once per prepared draft (G, server side) or per form instance
--   (/briefs/new), so the SAME operation always carries the SAME key and a
--   NEW brief carries a new key.
--   A partial unique index on (company_id, request_key) makes the database
--   the arbiter: a second insert with the same key fails with 23505, which
--   the action treats as "already created" and answers with the first
--   brief's id. Concurrent duplicates are serialised by the index itself.
--   Rows without a key (every existing brief, and edits) are unaffected.
--
-- WHO: written by the server only (service role), like every briefs column.
--   authenticated keeps its existing table-level SELECT under RLS; the key
--   is an opaque random value with no meaning outside its own company.
--
-- SIZE / LOCKING: adds a nullable column (no rewrite) and builds a partial
--   index over the rows with a key, of which there are none when this runs.
--   CREATE UNIQUE INDEX takes a SHARE lock on briefs for the build, which on
--   an empty partial index is a few milliseconds.
--
-- IDEMPOTENT.
-- ROLLBACK:
--   drop index if exists public.briefs_company_request_key_uidx;
--   alter table public.briefs drop column if exists request_key;
-- ===========================================================================

alter table public.briefs add column if not exists request_key uuid;

comment on column public.briefs.request_key is
  'Idempotency key of the request that created this brief. Unique per company when set; null for briefs created before 0038.';

create unique index if not exists briefs_company_request_key_uidx
  on public.briefs (company_id, request_key)
  where request_key is not null;
