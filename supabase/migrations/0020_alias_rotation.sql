-- ---------------------------------------------------------------------------
-- Green Light — keep a rotated inbound alias working (§5.1, §5.3)
--
-- An alias is not only a database value: the creator pasted it into a Gmail
-- auto-forwarding rule, and that rule is the only thing that puts an offer in
-- front of them. Rewriting `inbound_alias` therefore cannot be a one-column
-- UPDATE — the sender keeps forwarding to the address they were given, and the
-- intake stops recognising it. From the creator's side that looks exactly like
-- sponsors going quiet.
--
-- So a rotation moves the old value here, and the intake matches on both
-- columns (src/lib/email/intake.ts). The creator updates their forwarding rule
-- when convenient rather than at the moment we deploy.
--
-- Deliberately no GRANT UPDATE to `authenticated`. 0003 grants that privilege
-- column by column and this column is not in the list, so a creator cannot
-- point a retired alias of their own at anything. Same reasoning as
-- inbound_alias itself: the platform issues these, the account does not.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists previous_inbound_alias text;

-- Unique like `inbound_alias`, so a retired alias can never resolve to two
-- creators. Partial, because almost every row is NULL and NULLs do not
-- conflict under a plain UNIQUE anyway — this just says so explicitly.
create unique index if not exists profiles_previous_inbound_alias_lower_idx
  on public.profiles (lower(previous_inbound_alias))
  where previous_inbound_alias is not null;

comment on column public.profiles.previous_inbound_alias is
  'The alias this creator held before the most recent rotation. Still accepted by the §5.3 intake so a Gmail forwarding rule pointing at it keeps working. Server-written only: never granted to `authenticated`. Safe to clear once the creator has re-pointed their rule.';
