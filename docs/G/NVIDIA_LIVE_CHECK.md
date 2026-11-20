# Live NVIDIA check (owner-run)

## Live findings, 2026-11-20 (no key used)

`integrate.api.nvidia.com` became reachable from the agent environment (the owner allowed the host). No real key was supplied, so **no successful model call has been made**. What the real endpoint showed:

| Check | Result |
|---|---|
| `GET /v1/models` without any key | **HTTP 200**, 33 models. The catalog is public, so a 200 here does **not** validate a key |
| Is `meta/llama-3.3-70b-instruct` (the code default) listed? | **No** |
| Chat with the code default | **HTTP 410**: "The model 'meta/llama-3.3-70b-instruct' has reached its end of life on 2026-08-26T09:00:00Z and is no longer available." |
| Chat with a listed model and no key | HTTP 401 "Unauthorized access" |
| Chat with a listed model and an invalid Bearer key | **HTTP 403** "Authorization failed" (not 401) |

**Consequences:**
- Every deployment that leaves `NVIDIA_MODEL` unset has served rule-based output only since 2026-08-26: deal pricing, reply drafts, company briefs, niche detection and G. Whether production sets `NVIDIA_MODEL` could not be checked; reading Vercel was not permitted.
- Choosing the replacement model is an owner decision. The code default is unchanged.
- No model's output quality, Arabic behaviour, latency or JSON compliance is known until a real key is used.

**Fixed in code** (`src/lib/ai/chat.ts`, `nvidia-config.ts`):
- 410 is now terminal. It was retried before, wasting the second attempt.
- A 404 or 410 logs `nvidia.model_unavailable` with NVIDIA's reason.
- The key diagnostic `nvidia.credential_rejected` now fires on 403 as well. Before, it never fired for a wrong key.
- `scripts/check-nvidia.mjs` says the catalog step does not validate the key, and explains 403 and 410.

**Verified against the real endpoint, isolated stack, synthetic `ux-creator` account** (`scripts/isolated-validation/g-nvidia-failure-live.mjs`):
- **Retired default (410):** G answered HTTP 200 from rules in English and Arabic, after one attempt, and logged `nvidia.model_unavailable`. The key never appeared in the log. 4/4.
- **Listed model with an invalid key (403):** the same, and `nvidia.credential_rejected` was logged. 4/4.

These prove the failure paths only. They do not prove the AI works.

**Still required for a real validation:**
- a build.nvidia.com key, entered through the environment's secret form (the proxy injects it, and it never reaches a file or the chat) or on the owner's machine;
- an owner choice of `NVIDIA_MODEL` from the current catalog.

Then run the two steps below, with step 2 against `g-ai-live.mjs`.

---

Every AI path of G is tested against a scripted fake (`g-ai-paths.mjs`, 12/12). The real model has never been called from this project's test environment:
- `integrate.api.nvidia.com` is not reachable from the agent sandbox;
- the key exists only in Vercel, which is not to be read or changed.

These two steps are for the owner, on their own machine. Nothing here changes Production, and nothing reads or writes Vercel.

## Safety rules

- **Run it on your own computer only.** Not in CI, and not on a shared or recorded terminal.
- **Never put the key in a tracked file.** `.env.local` is git-ignored (`.gitignore` ignores `.env*`), but the method below avoids writing it to disk at all.
- **Keep it out of shell history.** Enter the key with a hidden prompt, and unset it afterwards.
- **What the scripts print:**
  - `check-nvidia.mjs` prints the key's **length** and whether it starts `nvapi-`. It does not print the value. If the key does not start with `nvapi-`, it prints only the length.
  - `g-ai-live.mjs` never touches the key; the app reads it from its own environment.
- **Quota:**
  - step 1 makes **2 calls** with a fixed, data-free prompt (`Reply with only this JSON object: {"ok": true}`);
  - step 2 makes **4 G requests** (up to 8 calls with the app's one retry), using the throwaway `ux-*` accounts on the isolated stack.

## Step 1: is the key valid, and is the model available?

macOS or Linux (bash/zsh):

```bash
cd green-light-analyizer
read -rs NVIDIA_API_KEY && export NVIDIA_API_KEY   # paste the key, press Enter (nothing is echoed)
node scripts/check-nvidia.mjs
unset NVIDIA_API_KEY
```

Windows PowerShell:

```powershell
$k = Read-Host -AsSecureString "NVIDIA key"
$env:NVIDIA_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($k))
node scripts/check-nvidia.mjs
Remove-Item Env:NVIDIA_API_KEY
```

`NVIDIA_MODEL` is optional. Without it, the script checks the code default, `meta/llama-3.3-70b-instruct`. If production sets a different model, set the same id here (it is not secret).

| Output | Meaning |
|---|---|
| `GET /v1/models` HTTP 200 and `✓ "<model>" is in the catalog` | Model is listed. **Not** a key check: the catalog is public |
| HTTP 401 or 403 in step 2 | Key rejected (NVIDIA answers an invalid key with 403): a wrong value, an NGC/org key instead of a build.nvidia.com `nvapi-` key, or revoked. The script lists the likely causes |
| `✗ "<model>" is NOT in the catalog` | Every production call would 404 and G would silently use rules. Change `NVIDIA_MODEL` |
| `POST /v1/chat/completions` HTTP 200 with `content: N chars` | The key is valid and the model answers |
| HTTP 410 in step 2 | The model is retired; pick another from the catalog |
| A non-printable-character warning | The stored key contains invisible characters (often bidi marks from an RTL editor). Re-copy it |

## Step 2: G end to end against the real model (optional)

This needs the isolated stack and accounts from `scripts/isolated-validation/README.md`.

1. Write `live` into a mode file, for example `echo live > /tmp/nvidia.mode`.
2. Start the app against the isolated stack with:
   - `MOCK_NVIDIA=/tmp/nvidia.mode`;
   - `NODE_OPTIONS="--import scripts/isolated-validation/mock-externals.mjs"`;
   - the key exported as in step 1.

   Every other external host stays mocked, and only NVIDIA passes through.
3. Run `DB_URL=… APP_URL=http://127.0.0.1:3200 node scripts/isolated-validation/g-ai-live.mjs`.

It checks four things:
- an English creator answer with `engine: "ai"`;
- an Arabic creator answer written in Arabic;
- a follow-up that uses the history;
- a company recommendation answered by the model alongside the computed cards.

`engine: "rules"` means the model's answer was rejected or never arrived. The app's server log then says why:
- `nvidia.unavailable` with `terminal_status`, `deadline` or `attempts_exhausted`;
- or `g.reply_ungrounded` / `g.model_reply_rejected`.

Afterwards, `unset NVIDIA_API_KEY` and set the mode file back to `down`.
