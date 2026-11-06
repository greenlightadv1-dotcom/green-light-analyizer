# Production readiness report (updated 2026-11-03)

## Verdict

**Not ready for production.** Everything is local, on branch `claude/eager-gauss-dox9tq`. Production is unchanged at `main` `5580a78`, and migrations 0025–0037 are applied nowhere.

## Blockers

### Database (approval needed)

- Apply 0025–0037 in order (`docs/RELEASE/DATABASE_MIGRATION_PLAN.md`), first to a Supabase branch.
- Insert at least one row into `verification_reviewers`. Until then nobody can review applications.

### Supabase Auth configuration (instructions only; not changed)

1. **"Allow new users to sign up": OFF.** Otherwise the public anon key can create auth users, bypassing review. The server creates users with the service role, which this setting does not affect.
2. Site URL and redirect URLs: the production domain.
3. Password rules: at least 10 characters with digits, upper and lower case, and symbols. The activation form enforces the same rules.

### Vercel environment (instructions only; not changed)

| Variable | Needed for |
|---|---|
| `RESEND_API_KEY` and a verified sender | Resume links, activation links and decision emails. Without them nobody can apply. |
| `CRON_SECRET` (16+ characters) | YouTube 29-day cleanup and any scheduled job |
| `ROLE_MAILBOX_FORWARD_TO` | An operator inbox for support@, privacy@ and the other role mailboxes |
| `VERIFICATION_RETENTION_DAYS` | Only after the legal decision |
| `NEWS_MONITORING_ENABLED=1` | Only after approval |
| `NEXT_PUBLIC_ENABLE_UI_PREVIEW` | Must stay unset |

**Schedules:** `/api/cron/relay-retry`, `/api/cron/news-refresh` and `/api/cron/verification-retention` exist but are not in `vercel.json`. Adding them is a Vercel configuration change and needs approval.

### Providers

- **Google:** OAuth verification status for the YouTube scopes is unknown.
- **Instagram:** stays disabled. The pinned Graph v19.0 expired on 2026-05-21.
- **X:** paid.
- **TikTok, Kick, Twitch:** syncs not built (owner decision).

### Legal (owner and counsel)

- **Terms §2:** says the team creates every account. Under the new flow the team approves, then the applicant creates the account from the emailed link. The wording needs updating and review.
- **Privacy Policy:** must cover identity data, the facial photo, retention, and reviewer access. The Egypt PDPL checklist is in `docs/IDENTITY_DOCUMENT_SECURITY.md`.
- **Terms of use:** of the Steam Web API and the YouTube blog feed (news).
- **Operator details:** `ENTITY_*` in `lib/constants/legal.ts`.

### Business (owner decisions)

- The retention period for identity documents.
- Whether admin-created accounts (`/admin/users`) must also pass KYC.
- The gated representative scopes (send invitations, financial data, manage representatives), and whether representative accounts may act as independent companies.
- Malware scanning: self-hosted ClamAV, or re-encoding images.
- Liveness or face-match provider (paid, biometric).
- Kick and Twitch public-count syncs; the TikTok integration.
- News sources beyond the two verified ones.
- Pricing from synced reach (earlier item 12).
- Supabase Free vs Pro.

## Release sequence

Each step needs approval.

1. Push the branch and update PR #6.
2. Run CI.
3. Supabase branch: apply 0025–0037, then verify.
4. Preview deployment and smoke test (`DATABASE_MIGRATION_PLAN.md`).
5. Configure Auth and the environment.
6. Back up, then apply to production.
7. Merge and deploy.
8. Production smoke test (CLAUDE.md §16), then follow `docs/RELEASE/ROLLBACK_PLAN.md`.
