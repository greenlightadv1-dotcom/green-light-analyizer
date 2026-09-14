# Admin account management — design

## Problem

`/admin/users` can create accounts but not edit them afterward. Per CLAUDE.md
§4.3, plan upgrades and payment confirmation happen manually via Discord — but
nothing in the app lets an admin apply that upgrade once it's confirmed, so
every account is stuck on `Starter` forever. There is also no way to change an
account's `region`, correct a miscreated `role`, or ban/unban outside the §6
violation-review flow.

## Scope

Extend the existing Accounts page so admin can, on any account that isn't
their own:
- Change `subscription_plan` (Starter/Pro/Elite)
- Change `region` (MENA/International)
- Change `role` (creator/company/admin)
- Ban (with a reason) or unban

Out of scope: migrating existing deals/media kits when role changes,
platform-wide stats, deal oversight — these are separate future features.

## Data model

New migration `supabase/migrations/0012_admin_account_management.sql`:

```sql
create table public.admin_actions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references public.profiles(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete cascade,
  action text check (action in
    ('plan_change', 'region_change', 'role_change', 'ban', 'unban')) not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.admin_actions enable row level security;

create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using (private.is_admin());
```

No policy for insert/update/delete: every write goes through
`createAdminClient()` (service role), the same pattern already used for
`violation_logs`/`profiles.banned_at`. No changes to `profiles` — all the
columns this feature touches already exist.

## Server actions

Added to the existing `src/app/(app)/admin/users/actions.ts`:

- **`updateProfile(formData)`** — `requireRole("admin")`, reject if
  `target_id === admin.id`. Fetch the current row first so the diff (old →
  new) going into `admin_actions` is exact and so we know whether `role` is
  actually changing. Update `subscription_plan`/`region`/`role` via the admin
  client, write one `admin_actions` row per field that actually changed.
  If `role` changes to `creator` and no `inbound_alias` exists yet, generate
  one (reusing `generateInboundAlias`, same as account creation). Leaving
  `creator` leaves the alias in place rather than deleting it.
- **`setBan(formData)`** — fields `profile_id`, `action` (`ban`/`unban`),
  `reason` (required for `ban`). Reject if `target_id === admin.id`. Sets or
  clears `banned_at`/`banned_reason`, writes one `admin_actions` row.

Both revalidate `/admin/users` on success.

## UI

Each row in the existing accounts table gets a native `<details>` disclosure
(`<summary>Manage</summary>`) — no client-side JS, consistent with the rest of
the admin area. Expanded content: one form with plan/region/role `<select>`s
defaulting to current values plus "Save changes", and a separate ban/unban
control (a required reason `<input>` appears only when banning; an existing
`banned_reason`/date is shown when already banned).

The admin's own row shows no "Manage" disclosure at all — nothing to lock
yourself out of, rather than field-by-field guards.

A short note near the role selector: "Changing role does not move this
account's existing deals or media kits — use this to correct a miscreated
account, not to reassign an active one."

## Testing

New `supabase/tests/admin_actions_test.sql`, same `BEGIN…ROLLBACK` +
`SET LOCAL ROLE` impersonation style as the existing suites:
- Admin can read `admin_actions`.
- Creator, company, and anon cannot.
- (Documented, not DB-testable) self-ban/self-demote is rejected in the
  server action, not the database — covered by keeping the "no Manage on your
  own row" UI guard and the explicit `target_id === admin.id` check.

Existing suites (`rls_policies_test.sql` etc.) are unaffected — no changes to
any policy they already cover.
