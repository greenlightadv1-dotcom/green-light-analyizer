# Google OAuth data-access verification (YouTube)

Status on 2026-11-23, checked in Google Cloud console, project `green-light-507919`:

- Publishing status: **In production**, user type **External**.
- Branding: **verified**.
- Data access: **not verified**. The app requests sensitive scopes, so until
  Google approves them every creator sees the "Google hasn't verified this app"
  screen, and the project is capped at **100 users for its whole lifetime**
  (2 used). The cap cannot be reset.

The two scopes (both read-only, both required, see
`src/lib/oauth/youtube-scopes.ts`):

| Scope | Sensitivity |
|---|---|
| `https://www.googleapis.com/auth/youtube.readonly` | Sensitive |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | Sensitive |

Neither is a Restricted scope, so no CASA security assessment is needed.

## What to submit

Google Cloud console → Google Auth Platform → **Data Access**: both scopes
must be listed. Then **Verification Center → Prepare for verification**.

### Scope justification (paste as is, English required)

**youtube.readonly**

> Green Light is a sponsorship marketplace where content creators receive paid
> brand deals. When a creator chooses to connect YouTube, we call
> `channels.list?mine=true` once to identify which channel the creator owns, so
> the audience data we show sponsors is tied to the creator's own channel
> instead of a name they typed. The YouTube Analytics `reports.query` method
> also requires this scope. We read only; we never upload, edit, comment or
> manage anything on the channel.

**yt-analytics.readonly**

> We call YouTube Analytics `reports.query` for the connected channel's viewer
> percentage by country. Green Light uses it for one purpose: to price an
> incoming sponsorship offer and rate its risk, because a sponsor targeting
> Egypt pays differently for an audience in Egypt than for one elsewhere. The
> figures are shown to the creator in their Media Kit and used in their own
> deal evaluations. We do not sell them, use them for advertising, or use them
> to train AI models. They are deleted when the creator disconnects, when
> Google revokes the grant, or after 30 days without a refresh.

### Demo video (unlisted YouTube link, about 2 minutes, English or English captions)

Google rejects a video that skips any step below. Record the screen at
`https://www.greenlightadvs.com` in this order:

1. Show the browser address bar with `greenlightadvs.com`, then sign in as a
   creator.
2. Open **Media Kit** and point at the YouTube card.
3. Click **Connect YouTube analytics**. The Google consent screen must show
   the app name "Green Light" and **both** permissions. Pause on it.
4. Approve. Show the redirect back to the Media Kit with the YouTube card
   marked **verified**.
5. Show where the data is used: the verified country list on the card, then
   the **Manual Analyzer** with an offer analysed, where the pricing basis says
   "verified".
6. Show **Disconnect**: click it and show the verified data disappear.
7. Open `/privacy` and scroll to section 5 (Google user data and YouTube API
   Services).

### Other fields

- Homepage: `https://www.greenlightadvs.com`
- Privacy policy: `https://www.greenlightadvs.com/privacy` (section 5 already
  carries the Limited Use statement and the 30-day retention)
- Terms: `https://www.greenlightadvs.com/terms`
- Authorized domain: `greenlightadvs.com`
- Support email: the operator inbox

## After submitting

Google replies by email to the project owner, usually within days to a few
weeks, and often asks one follow-up question. Answer from this file. No code
change is needed when approval arrives: the unverified screen and the user cap
disappear on Google's side.
