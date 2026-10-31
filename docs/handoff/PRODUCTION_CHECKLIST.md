# Production readiness handoff (prepared 31 October 2026)

**Nothing in this document has been done in Production.** It describes the next
phase, which waits for the owner's explicit approval.

## Where things stand

- **Production:** `main` at `5580a78`, deployed on `www.greenlightadvs.com`.
- **Branch:** `claude/eager-gauss-dox9tq` at `856fa16`.
  - 2 commits ahead of `main`: `9a627c3` docs, and `856fa16` the mobile
    navigation drawer.
  - `main` has nothing the branch lacks, so a fast-forward is possible once
    the work below is committed.
- **Uncommitted work on the branch:** 61 modified, 74 new, 3 deleted files.
- **Database:** migrations 0001–0024 are applied to the live project. The
  owner applied **0024** through the SQL Editor and its verification checks
  passed (owner-confirmed, 2026-10-31).

## 1. Code ready for review (all uncommitted)

| Area | Main files |
|---|---|
| Mobile navigation (committed in `856fa16`, plus new tests) | `components/dashboard/{MobileNav,NavLinks,Sidebar,TopBar,nav}.tsx/ts`, `nav.test.ts`, `scripts/mobile-nav-e2e.mjs` |
| Unified Creator Plan, 10% commission, pricing/legal/support copy | `lib/plans.ts`, `lib/access.ts`, `lib/support.ts`, `app/(app)/pricing`, `app/(app)/support`, `app/terms`, `app/privacy` |
| Get Started, applications, admin review, representatives | `app/get-started/**`, `components/get-started/**`, `app/(app)/admin/requests/**`, `app/(app)/admin/users/*`, `lib/access-requests.ts` |
| Onboarding, taxonomy, uploads | `app/(app)/onboarding/**`, `components/onboarding/**`, `components/uploads/**`, `app/api/uploads/**`, `lib/{onboarding,taxonomy,uploads,upload-server}.ts` |
| Discovery v2 | `app/(app)/discover/*`, `components/views/DiscoverView.tsx`, `lib/discovery.ts` |
| G assistant, voice, "Hey G" | `app/api/g/route.ts`, `lib/g/**`, `components/g/**`, `scripts/g-voice-e2e.mjs`, `scripts/g-wake-e2e.mjs` |
| Translations (5 languages) | `lib/i18n/dictionaries/*.ts` |
| Migration and handoff | `supabase/migrations/0024_…sql`, `docs/handoff/**` |
| Docs | `CLAUDE.md` §8, §16, §17; `README.md` |

Local checks at handoff:
- **Unit tests:** `npm test` all pass. Exact counts are in the final report.
- **Static checks:** typecheck, lint and production build are clean.
- **Browser tests** (against `/preview`): drawer 18/18, voice 18/18,
  "Hey G" 31/31.

## 2. Migration 0024: applied (owner-confirmed)

The owner applied 0024 to Production through the SQL Editor and
`0024_verify.sql` passed (owner-confirmed, 2026-10-31). **Do not run it
again.** `docs/handoff/migration-0024/` keeps the exact SQL and the
instructions as the record. 0024 is compatible with both the code currently
in Production and the new release, so the deploy can follow at any time.

## 3. 0024 verification (done by the owner; rerunnable read-only checks)

- `0024_verify.sql`: every `ok` is `true`, and the row counts are unchanged.
- **Storage → Buckets:** `avatars` (public) and `creator-documents` (private)
  exist with 2 MB and 5 MB limits.
- **Database → Advisors → Security:** no new warnings for `access_requests`,
  `company_members` or `creator_directory`.
- Optional: record 0024 in the migration history, or accept that the SQL
  Editor run is not recorded (see the migration README).

## 4. Production environment variables (verify names in Vercel → Project → Settings → Environment Variables; never paste values into tickets or chat)

No new variable is introduced by this release.

| Variable | Needed for | Required? | Last known state |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Everything; avatar public URLs | Required | Set (site works) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sign-in, RLS reads | Required | Set (site works) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes, applications, uploads, signed links | Required | Not verified from here |
| `CRON_SECRET` | Daily YouTube data-freshness job | **Required** (Google OAuth is configured) | **Missing** (CLAUDE.md §16) |
| `NVIDIA_API_KEY` | G and Analyzer AI (rules fallback without it) | Optional | Not verified |
| `NVIDIA_MODEL` | Model override | Optional | Not verified |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`, `YOUTUBE_API_KEY` | YouTube connect/sync | Optional | Client id set; others not verified |
| `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET`, `RESEND_FROM_ADDRESS` | Email intake and relay | Optional | Not verified |
| `NEXT_PUBLIC_ENABLE_UI_PREVIEW` | `/preview` | Must be **unset** in Production | Not verified |

The safest check after deploying is `/admin/system` (signed in as admin): it
reports which variables are set, without revealing any value.

## 5. Remaining blockers and risks

1. **`CRON_SECRET` missing:** the YouTube 30-day cleanup is deployed but not
   running, so the privacy policy's deletion statement is not yet true in
   practice.
2. ~~Migration 0024 not applied~~: resolved. Applied and verified by the owner
   (section 2). Its SQL Editor run is not in the migration history.
3. **Legal operator details** (`ENTITY_*` in `lib/constants/legal.ts`) must be
   the owner's real details. The new Terms (10% commission, 31 October 2026)
   are for legal review before deploying.
   - `COMMISSION_EFFECTIVE_DATE` and `LEGAL_LAST_UPDATED` must equal the
     publication date; move both if publishing slips past 31 October 2026.
4. **Voice and "Hey G"** have not been tested with a real microphone. Edge,
   Safari and Firefox are untested.
   - Speech is processed by the browser vendor's service; the UI discloses
     this.
5. **Get Started is admin-reviewed, not self-signup.** Applicants are not
   notified automatically; the admin contacts them.
6. **Supabase Auth settings** (§16 item 5): Site URL, redirect URLs and
   password rules are not verified. Free plan pauses after inactivity.
7. **Discover deals still show the company's real email to the creator**
   (§16 item 7), pending an owner decision.
8. **Preview layout on phones:** with G's sheet open, the preview banner
   pushes the TopBar under the sheet. The sheet's close and Escape work. The
   signed-in app has no banner and is not affected.
9. **Instagram code** targets a deprecated Meta metric. It stays disabled
   server-side; update it before enabling.

## 6. Git and Vercel steps for the production phase (do not run without approval)

```bash
# 0. Review the uncommitted diff
git status
git diff --stat

# 1. Commit on the working branch (one or several logical commits)
git add -A
git commit -m "Release: unified Creator Plan, Get Started, onboarding, Discovery v2, G assistant, mobile nav"

# 2. Push the branch; let CI run (npm test, tsc, lint, build)
git push -u origin claude/eager-gauss-dox9tq

# 3. After CI is green and the owner approves: fast-forward main
#    (main is an ancestor of the branch, so no merge commit is needed)
git fetch origin main
git checkout main && git merge --ff-only claude/eager-gauss-dox9tq
git push origin main
```

**Vercel:**
- Pushing `main` triggers the Production deployment.
- Wait for READY, then check the deployment's commit hash.
- Rollback target: deployment `dpl_mBdwmQuq6HS8n32i7aRMYPWMKTfy` (`5580a78`).
  Use Promote/Instant Rollback in the dashboard.
- After setting `CRON_SECRET`, redeploy so the cron route sees it.

## 7. Post-deployment smoke test

Use real test accounts. Do the pass on desktop (≥1280px) and again on a
phone (or 390×844 device emulation).

**Public, signed out**
- `/` returns 200 and the "Get started" button opens `/get-started`.
- `/get-started/creator`, `/company` and `/company_representative` load. A
  test application succeeds (0024 is applied).
- `/terms` and `/privacy` show the 10% commission and the effective date.
- A signed-out `/dashboard` redirects to `/login`.
- `/preview` is **not** reachable in Production (`NEXT_PUBLIC_ENABLE_UI_PREVIEW`
  unset).

**Admin**
- `/admin/requests` lists the test application. "Create account" prefills
  `/admin/users`.
- Create a creator and a company. The forced password reset works.
- Link a representative.
- `/admin/system` shows no missing *required* variable (expect `CRON_SECRET`
  until it is set).

**Creator**
- `/onboarding`: the checklist renders; categories save; an avatar uploads
  with progress and can be removed; a document uploads and opens through its
  signed link.
- Media Kit: classification is shown.
- Analyzer: run an analysis, then use "Ask G to explain".
- G: open it, ask "How is my channel performing?", and check every number is
  labelled verified, synced or self-reported.
- Mobile: open the menu drawer. Links match the desktop Sidebar; it closes
  on navigation and on Escape.

**Company**
- `/onboarding`: before details are complete, sending an offer is refused
  with an explanation. After saving details it is allowed.
- Discover: filters, sort and pagination work, and verified geography only
  appears when fresh. Use "Add to comparison" and "Ask G".
- G: give a campaign brief and get recommendations; compare two creators.
- Mobile: the drawer shows the company link set, with no Analyzer or Media
  Kit.

**Chat and deal**
- Send an offer, chat both ways (masking still applies), move the deal to
  agreed, and have admin mark it paid.

**Optional voice:** on Chrome with a real microphone, try G's mic button, then
"Hey G" (enable, consent, indicator visible, Turn off).

Stop and roll back if any core flow fails: sign-in, the forced reset, deal
creation, chat masking, or admin marking a deal paid.
