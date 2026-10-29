# GREEN_LIGHT_VERIFICATION_AND_ONBOARDING

Design proposal for features **A** (Get Started onboarding), **B** (creator identity verification), **C** (sponsor company verification), **D** (company representatives) and **J** (reusing onboarding data).

**Status:** none of this is implemented. The design needs owner decisions D2–D5 (see ROADMAP §8) and is outside the §16 feature freeze unless the owner lifts it.

**Evidence labels:**
- **[V]** verified here
- **[C]** established from code
- **[D]** from provider documentation, checked 2026-10-29
- **[U]** unverified

No provider has been contacted. Prices and coverage are what each provider publishes, and must be confirmed in writing before a contract.

---

## 1. Non-negotiable rules

1. **Server-side authority.** Account status, application status, verification status, membership and scopes are written only by server code: a server action that has checked the caller's role, or a webhook whose signature has been verified. Clients never get `INSERT` or `UPDATE` grants on these columns.
2. **AI never decides.** No model output may approve an applicant, set a verification status, grant a scope or lift a ban. AI may only *summarise* an application for the human reviewer, and must never be shown identity documents.
3. **Identity documents and biometrics never go to a general-purpose AI model.** That includes NVIDIA and any LLM. They go only to the contracted identity-verification provider, under a DPA.
4. **No public URLs for identity material.** Private buckets only. Signed URLs live 5 minutes or less and are admin-only. Every access is written to `admin_actions`.
5. **Minimisation.**
   - Prefer the provider's hosted flow, where the provider stores the documents and Green Light stores only a case id, a decision and reason codes.
   - Never store raw MRZ/NFC data, selfies, face templates or full document numbers. Keep at most the last 4 characters, if a reviewer needs to disambiguate.
6. **Retention is defined before launch.** For example: rejected applications are deleted after N days, and verification artifacts are kept for the provider's legal minimum only. The owner and counsel set the values, and they are published in the Privacy Policy.
7. **§4 stays true unless the owner changes it (D2).** No account exists, and no app route is reachable, until an admin approves.
8. **§6 is unchanged.** Nothing collected here is ever shown to the other side of a deal: not a creator's identity, document or phone, and not a representative's personal email.

---

## 2. Feature A: "Get Started" onboarding

### 2.1 Today [C]

- The landing CTAs read "Request access" (`src/lib/i18n/dictionaries/en.ts:47`). They are rendered in `src/components/landing/LandingNav.tsx:33` and `Hero.tsx:44`, and link to Discord or WhatsApp (`src/lib/constants/contact.ts`).
- Only an admin creates accounts (`src/app/(app)/admin/users/actions.ts`, `createUser`: email, full name, role, region). A temporary password is issued, and `must_change_password` forces a reset (`proxy.ts`, `(auth)/set-password`).
- Live, 1 of 10 profiles still has `must_change_password` set [V].

### 2.2 Proposed model (recommended option D2-a: application plus admin approval)

The CTA becomes **"Get started"** and opens a public application form with three paths:

| Path | Collected (minimum) | Becomes |
|---|---|---|
| **Creator** | Display name, contact email (verified by one-time link), country, primary language, categories (from K), platform handles, optional base rate, consent | `profiles` role `creator`, plus J-mapped profile fields |
| **Sponsor company** | Company legal name, country of registration, website/domain, work email (verified), applicant's name and title, consent | `companies` row, plus an owner `company_members` row (see D) |
| **Company representative** | Work email on an existing company's domain, name, title, company selection or invite code | A pending `company_members` row that the company owner (or an admin) approves |

Admin approval reuses the existing `createUser` path unchanged: temporary password, forced reset, alias generation for creators. **No second account-creation path is introduced.**

### 2.3 State machine (`onboarding_applications.status`)

```
draft ──submit──▶ submitted ──(email link clicked)──▶ email_verified ──▶ under_review
under_review ──admin: request info──▶ needs_info ──applicant resubmits──▶ under_review
under_review ──admin: approve──▶ approved ──server: createUser OK──▶ account_created
account_created ──user sets password (existing forced reset)──▶ activated
under_review ──admin: reject (reason_code)──▶ rejected
{draft, submitted, email_verified, needs_info} ──applicant──▶ withdrawn
{submitted, email_verified, needs_info} ──no activity N days (job)──▶ expired
```

| Transition | Actor | Server guard |
|---|---|---|
| draft → submitted | Anonymous applicant | Rate limit per IP hash and per email; CAPTCHA; schema validation; §6.1 mask on free text |
| submitted → email_verified | Applicant | Single-use, hashed, expiring token (≤ 24 h) |
| → under_review | Server | Automatic after email verification |
| → needs_info / approved / rejected | Admin only | `requireRole("admin")`; reason code required for reject; written to `admin_actions` |
| approved → account_created | Server | Calls the existing `createUser`. If it fails, the application stays `approved` with an error, and is retryable and idempotent (one account per application) |
| → activated | Server | Set when `must_change_password` flips false |
| → expired | Scheduled job | No personal data kept beyond the retention period |

### 2.4 Abuse and safety

- **Bot protection:** CAPTCHA (e.g. Cloudflare Turnstile, free [U]) plus a new `RateLimitAction` (`onboarding_submit`) keyed on a hashed IP.
- **No enumeration:** the form never reveals whether an email already has an account; the response is always "check your email".
- **Masking:** free-text fields pass through the §6.1 mask before storage, and violations are logged.
- **No AI triage at intake.** An optional AI "application summary" for the admin is allowed only on non-identity text, and is labelled AI-generated.

### 2.5 Feature J: reuse onboarding data

- At approval, the server copies the verified application fields into `profiles` (`full_name`, `country`, `primary_language`, `base_rate_usd`, `social_links`) and `creator_categories`.
- Platform handles seed `media_kits.platform_handle`, labelled **self-reported** until OAuth verifies them (§7.2).
- The creator sees them pre-filled in Media Kit and Settings, and is never asked twice.
- After a retention window, the application row keeps only the status history and reason codes.

### 2.6 Acceptance criteria (A + J)

1. With no session, an applicant can never load any `(app)` route at any application status. This is tested against every route listed in the build manifest.
2. Approving an application creates exactly one account, even when the approve button is double-clicked or two admins act at once (tested with concurrent calls).
3. The new account forces a password reset on first login (the existing guard, regression-tested).
4. Every J field submitted appears pre-filled in the profile after activation. A test diffs the application against the profile.
5. Submissions beyond the rate limit are refused with HTTP 429 and no row is written.
6. Rejection requires a reason code, which is visible in the admin audit log.
7. The applicant receives a neutral message.
8. The landing CTA text is "Get started" in all five dictionaries (a type-checked key).
9. Discord/WhatsApp support links remain reachable from the form.

---

## 3. Feature B: creator identity verification

### 3.1 What it proves, and what it does not

- **IDV proves** that a real, live person holding a genuine government document submitted the application, and that the person matches the document.
- **IDV does not prove** that the person owns a channel. That is M's job (OAuth channel binding; see INTEGRATION §2.1).
- The UI must keep the two separate:
  - **"Identity verified"** is the person;
  - **"Channel verified"** is the account;
  - **"Audience verified"** is the analytics (§7.2).

### 3.2 Integration pattern (recommended)

1. The creator starts verification in Settings. The server creates a provider session and stores `verification_cases` with `status = pending` and a `provider_ref`.
2. The creator completes the provider's **hosted flow or SDK** (document + liveness). Documents go to the provider, not to Green Light.
3. The provider sends a **signed webhook**. The server verifies the signature (same discipline as `src/lib/email/verify.ts`), then fetches the decision from the provider API rather than trusting the payload alone.
4. The server stores only: decision (`approved`, `declined`, `resubmission_requested`), reason codes, document country and type, a timestamp, and optionally the last 4 characters of the document number.
5. An admin can override the decision, with a reason, and the override is audited. An admin override never deletes the provider's record.

### 3.3 Provider comparison (published information only)

| Provider | Egyptian documents | Liveness | Arabic | Published price | Notes / evidence |
|---|---|---|---|---|---|
| **Didit** | Egypt listed in its KYB coverage table; ID document coverage stated as global [D] | Yes (ID + liveness + face match) [D] | [U] | **500 free verifications/month; core KYC $0.33** [D]. KYB in Egypt: $2 (Lite) / $5 (with shareholders) / $9 (with UBO) [D] | Lowest published entry cost; fits the zero-cost MVP (§9) |
| **Veriff** | Passport ✓; national ID ✓ (non-Latin script on request, Enterprise plan); driver's licence ✓ (Latin script) [D] | ISO 30107-3 liveness [D] | Non-Latin is Enterprise-only [D] | Not published here [U] | Arabic-script ID needs the Enterprise tier |
| **Sumsub** | 14k+ document types, 220+ countries [D]; Egypt specifically [U] | Yes [D] | Arabic OCR [D] | Not published here [U] | Broad coverage; also offers KYB [U] |
| **Uqudo** | Egyptian national ID, passport, driving licence [D] | 3D liveness [D]; NFC chip reading in 22 countries [D] | MEA-focused [D] | Not published here [U] | Regional specialist |
| **Valify** (Egypt) | — | — | — | — | **Not researched.** Should be evaluated if the owner wants an Egypt-local processor |

**Not verified for any provider:**
- data-residency options;
- DPA terms;
- whether Egyptian law (Personal Data Protection Law No. 151 of 2020) requires a local licence or registration for processing biometric data [U]. Counsel must confirm this before launch of B.

**Recommendation (pending D3):**
- Pilot with **Didit**: its published free tier means no fixed cost while volumes are small.
- Keep the integration behind a small provider interface (`createSession`, `verifyWebhook`, `fetchDecision`), so Veriff, Sumsub or Uqudo can replace it without schema changes. This is not "a second provider of the same kind" in the §9 sense; IDV is a new capability.

### 3.4 Privacy and retention
- **Consent screen:** what is collected, by whom (provider name), why, how long it is kept, and a withdrawal path. The text must also be published in the Privacy Policy before launch.
- **Withdrawal:** the creator can withdraw. Green Light then deletes its case data and requests deletion at the provider (if the API supports it [U]), keeping only an audit stub ("case existed; deleted on date").
- **Logging:** the logger (`src/lib/log.ts`) already masks strings. Verification payloads are never logged; only case ids and decisions are.

### 3.5 Where it is required (decision D4)

| Option | Effect |
|---|---|
| Badge only (optional) | Lowest friction; companies see "Identity verified" as a trust signal |
| Before the first `agreed` deal | Stops fake creators from closing deals |
| Before payout (manual escrow) | Aligns with the money step; least friction early |

### 3.6 Acceptance criteria (B)
1. A webhook with a bad or missing signature is rejected, and no status changes (unit test with fixtures).
2. A valid webhook for an unknown `provider_ref` is ignored and logged.
3. `verification_cases.status` cannot be written by the `authenticated` role. A SQL test attempts it and fails.
4. No column or bucket in Green Light contains a document image, a selfie or a full document number. This is checked by a schema review, plus a test that the storage bucket list has no IDV bucket in the hosted-flow design.
5. Companies see only the badge, never the document country, name or reason codes. This is tested via `creator_directory()` and `/p/[slug]`.
6. The badge disappears within one request after an admin revokes it.

---

## 4. Feature C: sponsor company verification

### 4.1 Today [C]
- A "company" is a `profiles` row with `role='company'`. No legal entity is recorded.
- For email-originated deals only, `CompanyIntelligencePanel` shows WHOIS and Safe Browsing data plus an AI brief. These are **signals, not verification**.

### 4.2 Verification levels (proposed)

| Level | Proof | Set by |
|---|---|---|
| `unverified` | — | Default |
| `domain_verified` | A rep received a one-time code at an address on the company's domain; the domain is not a free-mail provider (the list in the existing free-email check); WHOIS age is shown as context | Server, automatically |
| `documents_verified` | An admin reviewed registration documents (jurisdiction-specific, below) | Admin only |
| `registry_verified` | A KYB provider matched the company against a registry | Server, after a signed provider webhook |

### 4.3 Jurisdiction notes

| Jurisdiction | Document | Machine source | Evidence |
|---|---|---|---|
| **Egypt** | Commercial register extract (مستخرج سجل تجاري) + tax card (البطاقة الضريبية) | **No confirmed public registry API.** GAFI and the commercial registry are in-person or portal-based; third-party data from D&B Egypt / Creditreform (commercial) | [D]/[U]. Didit lists Egypt KYB at $2/$5/$9 [D]; its data source is [U] |
| **UAE** | Trade licence (per emirate / free zone) | Not researched | [U] |
| **Saudi Arabia** | Commercial registration (CR) | Not researched (a government CR service exists; its access terms are [U]) | [U] |
| **International** | Certificate of incorporation | KYB provider | [U] per country |

**Recommendation (pending D5):**
- Launch with `domain_verified` (automatic, free) plus `documents_verified` (manual admin review, using the private bucket S11 with ≤5-minute signed URLs).
- Add `registry_verified` through a KYB provider only after volume justifies the per-check cost.

### 4.4 Use of the signals
- WHOIS age, Safe Browsing and the AI company brief remain **advisory**, displayed separately from the verification level. The two are never averaged (the same rule §6.2's 0021 note applies).
- An AI brief can never raise a level.

### 4.5 Acceptance criteria (C)
1. A company whose domain is a free-mail provider can never reach `domain_verified`. This is tested against the existing free-email list.
2. `documents_verified` can be set only by an admin, and is audited. The `authenticated` role cannot write it (SQL test).
3. Document files are reachable only through signed URLs that expire in 5 minutes or less. A request with an expired URL fails, and the bucket is not public (storage policy test).
4. The creator sees the company's level badge in the deal room. The company's documents are never shown to the creator.
5. A downgrade (for example, a failed renewal) removes the badge from new offers immediately; existing deals keep a history entry.

---

## 5. Feature D: company representatives

### 5.1 Today [C]
- One login is one company.
- Company-side reads and writes are scoped by `profile.id`: `deal_chats.company_id`, Discover's signed quote (`lib/deals/offer-quote.ts`), and RLS helpers in the `private` schema (0004, 0010).

### 5.2 Proposed data model

```
companies(id, legal_name, country, domain, verification_level, created_at)
company_members(
  company_id → companies, profile_id → profiles,
  role  'owner' | 'admin' | 'member',
  scopes text[]   -- e.g. 'send_offers','view_deals','negotiate','manage_members'
  status 'invited' | 'active' | 'suspended' | 'revoked',
  invited_by, invited_at, activated_at, revoked_by, revoked_at, revoke_reason
)
deal_chats.company_id  → stays a profile id during transition; add deal_chats.company_org_id → companies
```

**Migration (S8):**
- Each existing company profile becomes one `companies` row plus one `owner` member.
- `deal_chats.company_org_id` is backfilled.
- Old policies stay until every query is moved over, and are then removed in a separate migration.

### 5.3 Permission rules
- **Membership required:** a representative acts only through an `active` membership. Every company-side server action checks `company_members` for the required scope, not just `role = 'company'`.
- **Deals:** deals belong to the **company**, not to the representative. Revoking a representative never orphans or deletes deals.
- **Representative verification:**
  - an invite from an owner or admin;
  - proof of a work email on the company's verified domain (one-time code);
  - optionally IDV (B) for the owner role.
- **Revocation:**
  - takes effect immediately: the membership is set to `revoked`, and the next request is denied;
  - the representative's open sessions lose company access at the next server check, because the check is per request, not per token claim.
- **Masking:** §6 masking applies unchanged to every representative. A representative's personal email is never shown to the creator, only the company name.

### 5.4 Who can do what

| Action | Owner | Admin | Member | Revoked |
|---|---|---|---|---|
| Send an offer | ✓ | ✓ | if `send_offers` | ✗ |
| Negotiate in a room | ✓ | ✓ | if `negotiate` | ✗ |
| Invite or revoke members | ✓ | ✓ (not the owner) | ✗ | ✗ |
| See all company deals | ✓ | ✓ | if `view_deals` | ✗ |

### 5.5 Risks
- Re-scoping every company query is the highest-regression change in this roadmap. It needs SQL suites that run as each role, plus as a revoked member, before production.

### 5.6 Acceptance criteria (D)
1. A revoked member's next request to any company action is denied (test with a member revoked mid-session).
2. Company A's member can never read company B's deals (cross-tenant SQL test for every company-readable table).
3. A member without `send_offers` gets a refusal from the server action, not only a hidden button.
4. After migration, every pre-existing company still sees exactly the same deals (count and id equality per company, before and after).
5. The last owner cannot be removed or demoted.

---

## 6. Storage plan (shared by B, C and L)

| Bucket | Public? | Contents | Access |
|---|---|---|---|
| `avatars` (L, first) | Public read is acceptable (avatars are already public on `/p/[slug]`) | Re-encoded images, EXIF stripped | Owner writes own folder only |
| `verification-docs` (C, and B only if manual review is chosen) | **Never** | Company registration documents | Service role writes; admin reads via ≤5-minute signed URL; retention job deletes |

The live project has **0 buckets** [V]. L goes first to establish and test `storage.objects` policies on low-risk files.

---

## 7. What remains unverified
- Every provider's price beyond Didit's published page.
- Data residency and DPA terms for all providers.
- Legal requirements in Egypt, UAE and KSA for biometric processing and KYB.
- The availability of a machine-readable Egyptian company registry.
- CAPTCHA provider choice and its privacy terms.
