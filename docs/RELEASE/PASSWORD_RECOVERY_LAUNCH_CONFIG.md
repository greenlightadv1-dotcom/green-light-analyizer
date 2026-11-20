# Password recovery: launch-only configuration

**Status: not applied.** The code (P0-2) is on branch `claude/eager-gauss-dox9tq` and was tested on an isolated Supabase stack with Mailpit. Nothing below has been changed in production. The owner applies these settings at launch, together with the other launch steps in `PRODUCTION_RELEASE_CHECKLIST.md`.

## The journey

1. `/login` has a "Forgot password?" link to `/forgot-password`.
2. `/forgot-password` asks for an email address and always shows the same confirmation.
   - Rate limits:
     - **per email:** 5 an hour, 20 a day (`password_reset`);
     - **per client IP:** 30 an hour, 100 a day (`password_reset_client`).
   - The app calls `resetPasswordForEmail(email, { redirectTo: <site>/auth/recovery })`.
3. Supabase emails a link. It lands on **`/auth/recovery`**, which accepts either `?code=` (PKCE, the default template) or `?token_hash=…&type=recovery` (recommended template, below). Failures go back to `/forgot-password?link=expired|invalid|browser`.
4. The recovery session is held on **`/reset-password`** by the proxy: it can reach nothing else. There the person sets a new password under the activation rules.
5. Then every session of the account, on every device, is signed out, and the person goes to `/login?reset=done`.

## Settings needed in production

| # | Where | Setting | Value |
|---|---|---|---|
| 1 | Vercel → green-light → Environment Variables (Production) | `NEXT_PUBLIC_APP_URL` | `https://www.greenlightadvs.com`. The recovery `redirectTo` is built from it. If it is unset, the code falls back to `https://greenlightadvs.com`, which must then also be allow-listed (item 3). |
| 2 | Supabase → Authentication → URL Configuration → **Site URL** | Site URL | `https://www.greenlightadvs.com` |
| 3 | Supabase → Authentication → URL Configuration → **Redirect URLs** | Add exactly | `https://www.greenlightadvs.com/auth/recovery`. Add `https://greenlightadvs.com/auth/recovery` too, if item 1 is left unset. Supabase refuses any `redirectTo` that is not listed and falls back to the Site URL, so the link would then open the home page instead of the reset flow. |
| 4 | Supabase → Authentication → **SMTP Settings** | Custom SMTP | **Required for real users.** Supabase's built-in email service is for testing only: it sends only to the project's team members, with a very low hourly limit. Use the existing Resend account: host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key with sending access, sender on the verified `greenlightadvs.com` domain. This is not a new paid service; Resend's free tier is the existing provider. |
| 5 | Supabase → Authentication → Email Templates → **Reset Password** (recommended) | Link in the template | `<a href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`. With this template the link works in any browser or device. With the default template (`{{ .ConfirmationURL }}`) it works only in the browser that requested it; any other browser shows "open the link in the same browser", which is safe but less convenient. |
| 6 | Supabase → Authentication → Providers → Email | "Allow new users to sign up" off; minimum password length 10 with all character types | Already required by `PRODUCTION_READINESS_REPORT.md`. Recovery does not need sign-up. |

The link's lifetime is the email OTP expiry, Supabase's default of one hour, which is what the copy says. If the owner changes it, update `passwordReset.sentBody` in the five dictionaries.

## Production smoke test after launch

- [ ] `/forgot-password` with a test account's address: the email arrives from the Resend sender.
- [ ] The link opens `/reset-password` naming the masked address; `/dashboard` redirects back to `/reset-password`.
- [ ] Set a new password. You land on `/login?reset=done`; the old password fails; the new one works; another signed-in browser is signed out.
- [ ] Reopening the same link shows "expired or already used".
- [ ] An address with no account shows the identical confirmation, and no email is sent.

## Test evidence (isolated stack, 2026-11-19)

`scripts/isolated-validation/flow-password-reset.mjs`: **39/39 PASS**. Supabase CLI 2.122.1 local stack (Auth with sign-up disabled, Mailpit); app built against it; every external call mocked; 0 outbox entries.
