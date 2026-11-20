# Implementation roadmap (2026-11-02)

Phases follow the master prompt. The order was adjusted where the evidence showed a better dependency sequence:
- Email forwarding came first, because it was a live defect.
- The Analyzer audit came second, because its fixes were small.

## Done in this pass (local commits, not pushed)

| Phase | Work | Commit |
|---|---|---|
| A | Repository audit (`COMPREHENSIVE_PRODUCT_AUDIT.md`) | docs commit |
| — | Email forwarding diagnostic and fixes; migration 0030 | `f7944da` |
| D | Analyzer fixes; migration 0031 | `c1db985` |
| B | Creator KYC, company KYB, representatives, self-registration (off), admin queue; migration 0032 | `8c75da4` |
| C | Profile picture: drag-and-drop in the Media Kit | `2ba0692` |
| E | Natural-language company creator search | `3dfdc9f` |
| F | Idea approval, then G script workflow | `e39fdcd` |

The earlier priorities on this branch: collaboration (0026), notifications (0027), shortlists, portfolio and visibility (0028), content planning (0029), and G proposals.

## Next phases, in dependency order

1. **Release the branch:**
   - review;
   - push to PR #6 (approval);
   - apply 0025–0032 to a Supabase branch, then run `supabase/verify/*`;
   - a signed-in smoke test of each journey in `IMPLEMENTATION_TEST_REPORT.md`.
2. **Owner decisions** (`docs/RELEASE/PENDING_OWNER_DECISIONS.md`):
   - items 9–13;
   - D2 (self-registration);
   - D3/D4 (identity provider);
   - representative scopes;
   - document retention.
3. **Representative scopes:** a `companies` organisation model, and re-scoping company queries with cross-tenant SQL tests (VERIFICATION §5).
4. **Data-driven taxonomy:**
   - a `taxonomy_terms` table (parent/child, kind, en/ar labels, active);
   - seed it from `lib/taxonomy.ts` with the same ids, so stored values stay valid;
   - admin management;
   - main and secondary games.
5. **Channel intelligence:** per-video snapshots (top content, posting frequency, consistency), within the YouTube 30-day policy.
6. **News monitoring:** only after sources and the scheduler are approved (`G_CONTENT_INTELLIGENCE_ARCHITECTURE.md`).
7. **Instagram:**
   - Graph API version upgrade;
   - Meta App Review;
   - account binding.
8. **Profile image crop.**
