---
name: growth-research
description: Research the creator-economy market (competitors, YouTube/TikTok/Instagram platform changes, creator and brand demand, MENA regulation) and turn findings into Green Light feature proposals, each with an implementation plan, a security check and test coverage. Use when asked for market research, competitor analysis, trend scans, feature ideas or a growth brief for Green Light, and for the scheduled weekly market brief.
---

# Green Light growth research

Read `CLAUDE.md` first. It is the product spec, and §16 is a feature freeze:
proposals are written, never built, unless the owner says "ship X" or the
change is a launch blocker by §16's own definition. Ask before calling
anything a blocker.

## 1. Research

Use Firecrawl (`firecrawl_search`, `firecrawl_scrape`) for the web and its
structured providers for platform data (`youtube-com` for video details,
transcripts, comments, channel uploads; `oriane` for TikTok). Cover, each
time:

- **Competitors.** Global: Agentio, ThoughtLeaders, Passionfroot, Collabstr,
  Aspire, CreatorIQ, Beacons, TikTok One. MENA: Valors, Hypein, Klik
  Influence and any new entrant. Pricing pages, take rates, new features.
- **Platform changes.** YouTube, TikTok and Instagram. They move what our
  numbers mean; for example, YouTube's 24 Aug 2026 view-count change made
  public views ~1.7x engaged views.
- **Demand.** What creators and brands say they need: payments, usage
  rights, contracts, fraud, measurement, licensing.
- **MENA regulation.** UAE Media Council Advertiser Permit (mandatory from
  1 Feb 2026), KSA licensing, Egypt.

Evidence standard: every claim carries its source URL and date. Prefer
first-party data (platform docs, company data, regulators) over listicles.
Say when two sources disagree, and never round a vendor's marketing claim
into a fact.

## 2. Filter against the product

A proposal only survives if it strengthens one of the three value
propositions in `CLAUDE.md` §1 (verified stats, commission protection, the
Co-Pilot) or the MENA position, and fits §9's stack. Drop anything that:

- exposes a creator's contact details to a company (§6, §12);
- moves contact or payment off-platform;
- adds a second AI provider (§9);
- presents unverified data as verified (§7.2).

Do not fight TikTok One on TikTok. It has zero platform fees and pays
creators in under 30 days. Win where it is absent: YouTube-first,
cross-platform, MENA compliance, Arabic, protected payment.

## 3. Write each proposal in this shape

```
### <name>  ·  value: H/M/L  ·  effort: <days>  ·  freeze: post-launch | blocker?
Evidence      — 2–4 sourced facts.
Fit           — which value proposition, and why we win here.
Plan          — migrations (numbered after the latest in supabase/migrations),
                files to add/change, server actions, UI, env vars, cron.
Security      — the checklist below, answered for this feature.
Tests         — named unit tests (pure modules, node --test), plus a
                rolled-back live-schema RLS test where data access changes.
Owner action  — anything only the owner can do.
```

### Security checklist (answer every line)

- **Writes.** Do they go through a server action with the service role, after
  validation? Migration 0022 made `deal_chats`/`messages` server-only; keep
  new deal data the same way.
- **Grants and RLS.** Grants are column-level, and RLS gates rows, not
  columns. Any column a party must not set or read is excluded from the
  `authenticated` grant, or served through a SECURITY DEFINER projection
  with a hard-coded column list.
- **Client-supplied values.** Prices, ratings and terms that come back from
  the browser are signed (`src/lib/deals/offer-quote.ts`) or recomputed
  server-side.
- **Masking.** Every new free-text field that one party writes and the other
  reads passes `maskSensitiveData` server-side and logs violations.
- **Outbound fetches.** Host allowlist, parsed IDs, never arbitrary URLs
  (SSRF).
- **Rate limits.** Anything that costs money, pings a phone or emails
  someone gets a `consumeRateLimit` rule.
- **Logs.** Use `src/lib/log.ts` only. Never log offer text, chat text or
  response bodies (§12).
- **Revocation.** OAuth-derived data is cleared on disconnect (§12).

## 4. Deliver

Write the brief to `docs/research/<YYYY-MM-DD>-market-brief.md`, newest
proposals first, ranked by value ÷ effort. Commit it on a branch. Never
merge to `main` and never apply migrations without the owner's explicit
approval. End with the 1–3 proposals you would ship first after launch,
and why.
