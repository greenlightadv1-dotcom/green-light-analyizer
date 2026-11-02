# Rollback plan

## Application (Vercel)

- **Fastest:** Vercel → Deployments → the last good Production deployment → **Promote** or **Instant Rollback**.
  - The last known good deployment is `dpl_mBdwmQuq6HS8n32i7aRMYPWMKTfy` at `5580a78` (CLAUDE.md §16). It was not re-verified for this document.
- **Git:** on a branch, revert the merge commit or commits, then merge that revert through the normal pull-request flow. Never force-push `main`.

## Database

**0025** is additive and the old code never reads it, so rolling back the application doesn't require removing the table.

To remove it entirely, which deletes all growth history, the owner runs:

```sql
drop table if exists public.media_kit_snapshots;
```

**0024** stays. The previous application version is compatible with it (docs/handoff/migration-0024/README.md).

## Legal content

The new Terms and Privacy policy ship with `4b7f333`. Rolling the application back restores the previous text in the UI.

Communicate any published commission change according to Terms §14.

## Data written by the new release that survives a rollback

| Data | Affected by rollback? |
|---|---|
| Growth snapshots (if 0025 was applied) | No. They are pruned at 29 days only while the new code or job runs; delete them manually if rolling back long-term (SQL above). |
| Access requests and representative links | No (0024 objects) |
| Ban/unban rows in `admin_actions` | No (they existed before) |
