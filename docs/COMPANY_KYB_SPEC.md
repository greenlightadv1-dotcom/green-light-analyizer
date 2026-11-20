# Company KYB: implemented specification (2026-11-02)

This uses the same machinery as Creator KYC (`docs/CREATOR_KYC_SPEC.md`): migration 0032, the private bucket, the state machine, admin review and the decision emails. **Not deployed; 0032 not applied.**

## Data collected (`verification_cases.details`, kind `company_kyb`)

| Field | Required | Re-used from |
|---|---|---|
| `registered_name` | yes | `profiles.full_name` |
| `registration_number` | yes | — |
| `tax_number` | yes | — |
| `country` | yes | `profiles.country` |
| `website` | no (http/https only) | `profiles.company_website` |
| `social_links` | no | — |
| `contact_name` | yes | — |
| `contact_phone` | yes | — |

## Documents

- **Required:** a commercial register extract **and** a tax card.
- **Optional:** other.
- Both are enforced in the database at submission.

## Review

- Manual, by an admin, at `/admin/verification`. Approval records a manual document review.
- There is no registry lookup: no machine-readable Egyptian company registry was found (VERIFICATION §4.3).
- WHOIS, Safe Browsing and the AI company brief remain advisory signals elsewhere in the product, and never set a verification state.

## Open (owner decisions)

- **Badge:** whether an approved company shows a badge to creators, and what it says. Nothing displays it yet.
- **Mandatory:** whether KYB is required before a company can send offers. Today it is not; the existing "company details complete" gate still applies.
- **Retention:** retention of company documents.
