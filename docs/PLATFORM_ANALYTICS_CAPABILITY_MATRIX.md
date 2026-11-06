# Platform analytics capability matrix (2026-11-02)

## Key

| Mark | Meaning |
|---|---|
| ✅ | Built and used |
| 🟡 | Available from the provider but not built |
| ❌ | Not available to a third-party app |
| — | Not applicable |

- "Provider" facts come from earlier documented research (`GREEN_LIGHT_INTEGRATION_STATUS.md`, CLAUDE.md §7.3). They were **not re-verified today**.
- "Green Light" facts are from code.

| Metric | YouTube | Instagram | Twitch | Kick | TikTok | X |
|---|---|---|---|---|---|---|
| Followers / subscribers | ✅ Data API (synced) | 🟡 Graph (code exists, disabled) | 🟡 Helix | ❌ | ❌ | 🟡 paid API |
| Total views / media count | ✅ synced | 🟡 media_count | 🟡 | ❌ | ❌ | 🟡 |
| Recent median views | ✅ synced (0031, not applied) | 🟡 | 🟡 VOD views | ❌ | ❌ | 🟡 |
| Engagement rate | ✅ computed from 10 uploads; labelled self-reported (mixed provenance) | 🟡 | 🟡 | ❌ | ❌ | 🟡 |
| Average concurrent viewers | — | — | 🟡 live only, no history | ❌ | — | — |
| Audience country | ✅ Analytics OAuth (verified, < 30 days) | 🟡 Insights, App Review | ❌ | ❌ | ❌ | ❌ |
| Audience age / gender | 🟡 Analytics | 🟡 Insights | ❌ | ❌ | ❌ | ❌ |
| Growth over time | ✅ snapshots (0025, not applied; ≤ 29-day retention) | — | — | — | — | — |
| Top content / posting cadence | 🟡 (fetched, not stored) | 🟡 | 🟡 | ❌ | ❌ | 🟡 |
| Declared (self-reported) fields | ✅ every platform, always labelled self-reported | ✅ | ✅ | ✅ | ✅ | ✅ |

## Rules that hold everywhere (code)

- **Provenance on every figure:** `verified | synced | self_reported | estimated | missing`.
- **Verified figures:** must come from an OAuth API and be under 30 days old.
- **AI wording:** the AI may not state a figure absent from its data (`ungroundedFigures`).
- **Pricing (§7.4):** self-reported geography caps a high-value deal at yellow.
