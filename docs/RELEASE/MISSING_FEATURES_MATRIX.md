# Missing features matrix

Only features that are MISSING, PARTIAL or BLOCKED appear here. Evidence and
the full list are in `MASTER_IMPLEMENTATION_AUDIT.md`.

| # | Feature | Status | Needs a migration | Depends on | Blocker type | Security notes |
|---|---|---|---|---|---|---|
| 1 | Briefs and campaigns | BUILT, NOT APPLIED (0026) | 0026 `briefs` | Company onboarding | Apply 0026; owner: representatives' authority | Company-scoped writes; creators read published only |
| 2 | Invitations (accept/decline/request changes) | BUILT, NOT APPLIED (0026) | 0026 `invitations` | 1 | Apply 0026 | Parties only; text masked; accept opens a deal room |
| 3 | Deliverables, revisions, approvals, completion | BUILT, NOT APPLIED (0026) | 0026 `collaborations`, `deliverables`, `collaboration_events` (append-only) | 2 | Apply 0026. Reviews: owner decision (item 9) | Party-only access; no payments or escrow |
| 4 | In-app notifications and read state | BUILT, NOT APPLIED (0027) for collaboration events. Deal-room message read state: still MISSING | 0027 `notifications`, `notification_preferences` | 2, 3 | Apply 0027 | Recipient-only RLS; ids and event kind only, never free text |
| 5 | Support tickets | MISSING | Yes: `support_tickets`, `support_messages` | — | — | Creators and admins only |
| 6 | Content planning and saved drafts | BUILT, NOT APPLIED (0029). G drafting into it: see item 7 | 0029 `content_items` | — | Apply 0029 | Owner-only RLS; admins cannot read drafts |
| 7 | G drafts and proposals with explicit confirmation | BUILT (needs 0026 and 0029 applied for real data) | No new migration | 1–6 | Real NVIDIA quality check with live data | G prepares content drafts, invitations and message drafts. The person edits and confirms; the ordinary server action executes. Nothing runs automatically |
| 8 | Portfolio with consent | BUILT, NOT APPLIED (0028). Automatic showcase of completed collaborations: not built | 0028 `portfolio_items` | — | Apply 0028; owner: consent wording, and whether completed collaborations may be shown | Private by default; brand named publicly only with the creator's recorded consent; text masked |
| 9 | Public-profile section visibility toggles | BUILT, NOT APPLIED (0028) | 0028 `public_profile_settings` | — | Apply 0028 | Enforced in the public RPCs. Existing sections default on (unchanged page); portfolio defaults off |
| 10 | Company shortlists | BUILT, NOT APPLIED (0028) | 0028 `shortlists`, `shortlist_entries` | Discovery | Apply 0028 | Company-private; creators and admins cannot read them |
| 11 | Durable admin audit for violations, reject, unlink | BLOCKED | Yes: see PENDING_OWNER_DECISIONS.md | — | Owner approval | Append-only |
| 12 | Growth history over 29 days | BLOCKED | Policy-dependent | YouTube OAuth path | Owner and Google policy | Authorized data only, with 30-day re-checks |
| 13 | Instagram metrics and geography | BLOCKED | No | Meta App Review; API version upgrade | External | Disabled on the server today |
| 14 | TikTok, Twitch, X data | MISSING / BLOCKED | Maybe | App reviews; X cost | External | No scraping |
| 15 | Account self-deletion | MISSING | Possibly (cascade review) | Legal | Owner (retention) | Must remove OAuth tokens and storage objects |
| 16 | Arabic and Egyptian Arabic G benchmark | MISSING | No | NVIDIA key, quota | Owner (quota spend) | No user data in the benchmark |
| 17 | Real-microphone voice testing | NEEDS VERIFICATION | No | A person with a mic | — | — |
| 18 | Admin users, requests and promo pages translated | PARTIAL | No | — | — | — |
| 19 | Subscription pricing | Intentionally none | No | Cost model | Owner | No invented prices |
