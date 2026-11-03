# Company representatives: permissions (updated 2026-11-03)

## Model

- **Account:** a representative is a normal `company` account with its own login. There is no new role.
- **Link:** `company_members` (0024) links the representative to the company they represent. It is created by:
  - a verification reviewer approving a `representative` application (0032), which requires an authorization letter;
  - an admin, from `/admin/requests`.
- **Least privilege:** a link alone grants **nothing**. The company account grants scopes one by one at `/team` (migration 0034, not applied).

## Scopes

| Scope | Status | Enforced where |
|---|---|---|
| `company.view`: see the company's public details | Available | Server (`representationOf`, `/team`) |
| `company.edit`: edit name, industry, website, description | Available | Server (`saveRepresentedCompany`). Same validation as the company itself, including the §6 contact-detail refusal. |
| `discovery.view`: search and compare creators (Discover, G) | Available | Database (`creator_directory()` returns nothing without it) and the Discover page |
| `briefs.view`: read the company's briefs | Available | Database (RLS `briefs_select`) |
| `briefs.create`, `invitations.prepare`, `collaborations.access`, `deals.view` | Not built | Refused by `company_set_scope` (`perm:not_available`) |
| `invitations.send`, `deals.financial`, `members.manage` | **Approval required** (financial or contractual effect) | Refused by `company_set_scope` (`perm:approval_required`) until the owner decides |

Only scopes the product enforces can be granted, so no checkbox promises something that does nothing.

## Rules

| Rule | Implementation |
|---|---|
| Only the company account (or an admin) grants or revokes | `company_set_scope()` checks the actor is `company_members.company_id`. A representative, another company or a creator is refused. |
| No cross-company access | Every check joins scope → link → company. A scope is valid only for the company that granted it. Re-linking clears all scopes (`cleared_on_relink`). |
| Revocation is immediate | Scopes are read fresh on every request and in every RLS check; nothing is cached. |
| Auditable | `company_permission_events` (append-only) records grant, revoke and relink with actor and time. The company sees it at `/team`. |
| A banned company or member loses everything | `member_has_scope` requires both accounts unbanned. |
| No client writes | Scope tables are SELECT-only for `authenticated` (own rows); writes go through the service-role function. |

## Tests

- `supabase/tests/company_permissions_test.sql`: least privilege, owner-only grants, gated and unbuilt scopes refused, RLS and directory enforcement, cross-company isolation, immediate revocation, relink clearing, audit rows.
- `src/lib/company-access.test.ts`: the catalogue matches the SQL; server-side actor and scope checks.

## Owner decisions still open

1. **Gated scopes:** whether representatives may send invitations, see financial deal data, or manage other representatives, and on what terms.
2. **Unbuilt scopes:** creating briefs, preparing invitations, collaboration rooms and deal information *on behalf of* the company. Each needs the collaboration functions to accept an acting member and record them, which is a larger change.
3. **Representatives acting as independent companies:** a representative account can still use company features under its own account, such as its own briefs. Whether that should be blocked is a business decision.
