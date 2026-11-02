# Missing features matrix

Only features that are MISSING, PARTIAL or BLOCKED appear here. Evidence and
the full list are in `MASTER_IMPLEMENTATION_AUDIT.md`.

| # | Feature | Status | Needs a migration | Depends on | Blocker type | Security notes |
|---|---|---|---|---|---|---|
| 1 | Briefs and campaigns | MISSING | Yes: `briefs` with RLS by company | Company onboarding | Design review | Company-scoped RLS; representatives' authority undefined |
| 2 | Invitations (accept/decline/negotiate) | PARTIAL | Yes: `invitations`, server-side state machine | 1 | Design review | Creator sees only their own; no contact data |
| 3 | Deliverables, revisions, approvals, completion, reviews | MISSING | Yes: `deliverables`, `deal_events` (append-only) | 2 | Design review | Party-only access; no payments or escrow |
| 4 | In-app notifications and read state | MISSING | Yes: `notifications`, `message_reads` | 2, 3 | — | Per-user RLS; never include private message text of another tenant |
| 5 | Support tickets | MISSING | Yes: `support_tickets`, `support_messages` | — | — | Creators and admins only |
| 6 | Content planning and saved drafts (G) | MISSING | Yes: `content_items` | G | — | Owner-only RLS |
| 7 | G drafts and proposals with explicit confirmation | MISSING | Depends on 1–6 | 1–6 | — | Preview, confirm, then execute on the server; never claim success before the server confirms |
| 8 | Portfolio and collaboration history with consent | MISSING | Yes | 3 | Owner: brand consent wording | Company names or logos only with consent |
| 9 | Public-profile section visibility toggles | MISSING | Yes: column or table | — | — | Default off; enforced in the public RPC |
| 10 | Company shortlists | MISSING | Yes: `shortlists` | Discovery | — | Company-scoped |
| 11 | Durable admin audit for violations, reject, unlink | BLOCKED | Yes: see PENDING_OWNER_DECISIONS.md | — | Owner approval | Append-only |
| 12 | Growth history over 29 days | BLOCKED | Policy-dependent | YouTube OAuth path | Owner and Google policy | Authorized data only, with 30-day re-checks |
| 13 | Instagram metrics and geography | BLOCKED | No | Meta App Review; API version upgrade | External | Disabled on the server today |
| 14 | TikTok, Twitch, X data | MISSING / BLOCKED | Maybe | App reviews; X cost | External | No scraping |
| 15 | Account self-deletion | MISSING | Possibly (cascade review) | Legal | Owner (retention) | Must remove OAuth tokens and storage objects |
| 16 | Arabic and Egyptian Arabic G benchmark | MISSING | No | NVIDIA key, quota | Owner (quota spend) | No user data in the benchmark |
| 17 | Real-microphone voice testing | NEEDS VERIFICATION | No | A person with a mic | — | — |
| 18 | Admin users, requests and promo pages translated | PARTIAL | No | — | — | — |
| 19 | Subscription pricing | Intentionally none | No | Cost model | Owner | No invented prices |
