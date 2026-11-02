# Company representatives: permissions (2026-11-02)

## What exists

- **Account:** a representative is a normal `company` account (no new role), with its own login.
- **Link:** `company_members` (0024) links the representative to the company account they represent, with `member_role = 'representative'`.
- **Creating the link:**
  - Before 0032, only an admin could create it, from `/admin/requests`.
  - With 0032, approving a `representative` verification case also creates it, through `verification_transition('approve', …, p_company)`. The admin must choose an existing company account; a case cannot be linked to its own account or to a non-company account.
- **Evidence collected:**
  - legal name, phone, the company named by the applicant, and job title;
  - a required **authorization letter from the company**, plus an optional ID.

## What a link grants

**Nothing beyond the link itself.** A linked representative:
- sees which company they represent;
- cannot read that company's deals, briefs, collaborations, shortlists or notifications. Every one of those is scoped by `company_id = auth.uid()` in RLS and by the session's own id in server actions;
- acts only as their own company account.

This is deliberate. Giving representatives scoped access (for example "send offers" or "view deals") needs the permission model in `docs/GREEN_LIGHT_VERIFICATION_AND_ONBOARDING.md` §5.2–5.4:
- `companies` and `company_members.scopes`;
- every company query re-scoped from the owner's profile id to the organisation.

The design document calls that the highest-regression change in the roadmap. It is an owner decision (PENDING_OWNER_DECISIONS item 9), so the scopes are **not built**.

## Guarantees tested

`supabase/tests/verification_test.sql`:
- a representative is linked only by admin approval, and only to a real company account;
- another account cannot read the case;
- clients cannot write cases or call the transition.

The existing collaboration, notification and shortlist tests cover cross-company isolation of the data a representative must not see.
