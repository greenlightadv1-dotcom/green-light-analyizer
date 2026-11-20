# Comprehensive product audit (2026-11-02)

## Basis

- **Repository:** branch `claude/eager-gauss-dox9tq` at the HEAD current when this was written.
  - Local commits are ahead of the remote branch (`d6b0680`); `main` is `5580a78`.
  - Nothing here is deployed, and migrations 0025–0032 are applied nowhere.
- **Live data:** read only, as aggregates, for the email diagnostic. Nothing in production was changed.

## Statuses

| Status | Meaning |
|---|---|
| **COMPLETE** | Built end to end on the branch, with tests at every layer that applies. Still subject to the deployment and migration status above. |
| **PARTIAL** | Some of the requirement is built; the rest is listed. |
| **BROKEN** | Built but defective. |
| **NOT IMPLEMENTED** | Not built. |
| **BLOCKED** | Needs an external approval or provider. |
| **OWNER DECISION** | Needs a business, legal or pricing decision first. |

## 2. Homepage and Get Started

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| "Get Started" replaces "Request access" | COMPLETE | `components/landing/Hero.tsx`, `LandingNav.tsx` → `/get-started` | — |
| Clear Creator / Company choice | COMPLETE | `GetStartedChooser` (Creator, Company, Company representative) | — |
| Register without contacting the team | PARTIAL · OWNER DECISION | `/register`, `app/register/actions.ts`, `lib/registration.ts`, `/auth/confirm` | Off unless `SELF_SIGNUP_ENABLED=1`. Turning it on changes CLAUDE.md §3/§4 and Terms §2, and needs Supabase Auth email sign-up and confirmation settings (D2). Today the application form plus admin creation is the live path. |
| Email verification | PARTIAL | Supabase `signUp` with `emailRedirectTo` and `/auth/confirm` (`verifyOtp`) | Depends on Supabase "Confirm email" (production config). Not exercised against a real project. |
| Resume onboarding; pending, approved and rejected states | COMPLETE (branch) | `/verification` (any status), `requireProfile` redirect, `account_status` (0032) | Not exercised against a real database |
| Responsive, Arabic RTL | COMPLETE | Browser checks at 1440 and 390 px, en and ar (`scripts/collab-ui-e2e.mjs`) | — |

## 3. Creator KYC

See `docs/CREATOR_KYC_SPEC.md`.

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| Legal name, identity details, phone | COMPLETE (branch) | `lib/verification/rules.ts` FIELDS; pre-fill from profile | — |
| Document upload: drag-and-drop, validation, private, no public URL | COMPLETE (branch) | `api/verification/documents`, `DocumentUploader`, bucket `verification-docs` (0032) | — |
| Replace before submission | COMPLETE | Remove (confirmed) plus re-upload while `draft` or `needs_info` | — |
| Audit of events | COMPLETE | `verification_events` (append-only), including `document_viewed` | — |
| Face and liveness | BLOCKED · OWNER DECISION | Provider comparison in `GREEN_LIGHT_VERIFICATION_AND_ONBOARDING.md` §3.3; no provider integrated | Needs owner approval, budget and a legal opinion (Egypt PDPL 151/2020, biometrics). Approval stays a manual document review, and the UI never claims "identity verified". |
| Pending review; "aims for 24 hours", no guarantee | COMPLETE | `verification.reviewTime` | — |
| Admin view, approve, reject with reason, request info, history | COMPLETE (branch) | `/admin/verification`, `verification_transition()` | — |
| Approval email with next steps | COMPLETE (branch) · OWNER DECISION (wording) | `lib/verification/email.ts`, `notifyDecision` | No price invented. Payment-rails wording pending (item 13). |

## 4. Company KYB and representatives

See `COMPANY_KYB_SPEC.md` and `COMPANY_REPRESENTATIVES_PERMISSIONS.md`.

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| Company details, commercial register, tax card | COMPLETE (branch) | kind `company_kyb`; both documents required in SQL | — |
| States: pending, review, info, approved, rejected | COMPLETE (branch) | 0032 state machine | — |
| Representatives: own account, link, evidence | COMPLETE (branch) | kind `representative`, authorization letter required, link created on approval | — |
| Explicit permission scopes (owner vs representative) | NOT IMPLEMENTED · OWNER DECISION | Design in VERIFICATION §5 | Representatives get **no** access to company data. Scopes need an organisation model and the re-scoping of every company query (highest regression risk). |

## 5. Company AI creator search

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| Natural-language request → criteria | COMPLETE | `lib/g/brief-text.ts` (en and ar, deterministic), merged in `/api/g` | — |
| Ask for missing essentials | COMPLETE | `missingBriefFields` shown in the brief card | — |
| Search real authorised creators; explain matches; metrics with provenance | COMPLETE | `recommendCreators` over `creator_directory()` (RLS); provenance badges | — |
| Compare | COMPLETE | `compareCreators`, G comparison card | — |
| Shortlist | COMPLETE (branch) | 0028, `/shortlists`, "Save to list" in Discover | — |
| Prepare invitations or proposals | COMPLETE (branch) | G `invitation` proposal (confirm, then `inviteCreator`) | — |
| No private data or invented metrics | COMPLETE | The RPC returns no contact or intake columns; `ungroundedFigures` drops invented figures | — |

## 6. Email and message forwarding

See `docs/EMAIL_FORWARDING_DIAGNOSTIC.md`.

| Finding | Status |
|---|---|
| Role mailboxes (support@ …) forwarded to nobody | Was BROKEN. Fixed in code; needs `ROLE_MAILBOX_FORWARD_TO` (approval). |
| In-app rooms: no notice of new messages | Was BROKEN. Fixed (0030, not applied). |
| Relay outcome write unchecked | Fixed |
| Relay retry | OWNER DECISION (item 11) |

## 7. Creator dashboard and AI Analyzer

See `docs/AI_ANALYZER_ROOT_CAUSE_REPORT.md`.

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| Metrics with source, sync time and provenance | COMPLETE | `lib/g/provenance.ts`, `assessment.ts` | — |
| Growth only from two real snapshots | COMPLETE (branch) | 0025, `growth.ts` | 0025 not applied |
| Analyzer defects | Fixed: A1 (hidden likes), A2 (synced reach kept), A3 (silent API errors) | — | Pricing reach source is an owner decision (item 12). Mixed provenance of `engagement_rate` (A4) is not fixed. |
| Top content, posting frequency, consistency | NOT IMPLEMENTED | — | The sync reads 10 recent uploads. Per-video storage and a content view are not built. |

## 8–9. G content intelligence and gaming

See `docs/G_CONTENT_INTELLIGENCE_ARCHITECTURE.md`.

| Requirement | Status | Evidence | Missing / risk |
|---|---|---|---|
| G knows category, games, formats, language, data | PARTIAL | G context: assessment, profile classification (0024), content plan | No explicit "content goals" or "main game" field |
| Personalised ideas with evidence fields | COMPLETE | G `content_draft` (kind idea) with the required sections; grounding check | Quality not tested with the live model |
| Idea → approve → script → edit → save | COMPLETE (branch) | Content plan: approve, then "Ask G for a script", then a confirmed draft | — |
| News monitoring of categories, games and esports | NOT IMPLEMENTED · OWNER DECISION | Design only | Needs approved sources (licensed APIs or official RSS), a scheduler (cron needs `CRON_SECRET`), and storage. Never claimed to run. |
| Gaming taxonomy (genres, admin-managed, bilingual) | PARTIAL | `lib/taxonomy.ts`: 19 games, 13 categories, 8 formats (controlled list, en/ar labels via dictionaries) | Not in the database, no genres, no admin management. See `TAXONOMY_AND_GAMING_CATALOG.md`. |
| Main / secondary / streamed games | NOT IMPLEMENTED | `profiles.creator_games` (one list) | Needs a schema change |

## 10–11. Taxonomy and onboarding reuse

| Requirement | Status | Evidence |
|---|---|---|
| Searchable multi-select categories and games | PARTIAL | Onboarding and Discover filters use the controlled list; no parent/child, no admin UI |
| Never ask twice | PARTIAL | Verification pre-fills from the profile (`prefill`); the onboarding checklist is computed from data (`lib/onboarding.ts`). The application form (0024) is not yet linked to the self-registered profile. |

## 12. Profile image

| Requirement | Status | Evidence | Missing |
|---|---|---|---|
| Drag-and-drop upload replacing URL input | COMPLETE | `AvatarUpload` now in the Media Kit card and onboarding; the URL field was removed | Crop and position not built (`object-cover` centre) |
| Storage ownership, old-image cleanup | COMPLETE | `/api/uploads/avatar` (owner folder; previous own object removed) | — |

## 13. Social integrations

See `docs/SOCIAL_INTEGRATIONS_AND_SYNC_AUDIT.md` and `PLATFORM_ANALYTICS_CAPABILITY_MATRIX.md`.

- **YouTube:** available.
- **Instagram:** disabled (Graph v19.0 retired; App Review).
- **Twitch, Kick:** manual.
- **TikTok, X:** planned.

## 14. G across the platform

COMPLETE (branch) for navigation, collaboration status, content help, company search, and confirmable proposals. Every proposal executes only through the ordinary server action after a confirmation dialog.

## 15. Security

See `docs/SECURITY_AND_PRIVACY_REVIEW.md`.

## Dependencies

```
0024 (applied) → 0025 → 0026 → 0027 → 0028 → 0029 → 0030 → 0031 → 0032
```

- 0026 must precede 0027 and 0029.
- 0030 needs 0027.
- Self-registration needs 0032, plus Auth configuration and a Terms change.
