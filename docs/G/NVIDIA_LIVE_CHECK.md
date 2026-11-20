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

## Model selection (2026-11-20)

**Availability check.** Each candidate was checked against the live endpoint with no key: 401 means the model is live and needs a key; 410 means it is retired.

Retired:
- `meta/llama-3.3-70b-instruct`: end of life 2026-08-26.
- `moonshotai/kimi-k3`: end of life 2026-10-15.
- `z-ai/glm-5.3`: end of life 2026-10-28.

Every default this project has used is now retired. The models below all answered 401 (live).

| Model | Size (active) | Arabic | JSON / system prompt | Notes for G |
|---|---|---|---|---|
| **`mistralai/mistral-large-4-1t-a52b`** | 1T (≈52B) | 160+ languages; Arabic not named on the card | Strict JSON schema, JSON output, system prompts, function calling (card) | Released on NIM 2026-10-29, the newest in the catalog. Reasoning defaults to **high**: set `NVIDIA_REASONING_EFFORT=low` for latency |
| `google/gemma-4-31b-it` | 31B dense | 140+ languages; Arabic not named | Function calling; JSON output not stated | Released 2026-04-02. G parses JSON from text anyway (`extractJsonObject`, json_object retry) |
| `moonshotai/kimi-k3.1-pro` | (vision model, thinking) | not stated | Catalog says structured output, tools, thinking | Heavy (vision, 1M context). Its predecessor `kimi-k3` was retired after a short life |
| `z-ai/glm-5.3-flash` | 320B (18B) | not stated | Structured output, function calling | The family runs a thinking mode (mandatory on FlashX variants): latency risk. Its predecessor `glm-5.3` was retired 2026-10-28 |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | 30B (3B) | **No**: English plus 6 languages, none of them Arabic | Structured outputs listed by providers | Fastest, but **unsuitable**: Arabic is a primary market |
| `nvidia/nemotron-3.5-super-vl-120b-a12b`, `nemotron-3-ultra-550b-a55b` | 120B / 550B | not established | not established | No public language list was found |

**Recommendation (owner decision; nothing is changed in code or production):**
- **Default: `mistralai/mistral-large-4-1t-a52b` with `NVIDIA_REASONING_EFFORT=low`.** It is the only candidate whose card states strict JSON-schema output, system-prompt support and broad multilingual coverage together. That is what G's contract needs: one prompt, a JSON object with `reply` / `actions` / `proposals`, and replies in the message's language. Being the newest release, it is the least likely to be retired soon.

  G needs no code change: `NVIDIA_MODEL` and `NVIDIA_REASONING_EFFORT` are already read from the environment, and `chat.ts` already reads `reasoning_content` when a reasoning model leaves `content` empty.

  **Unknowns until a key is used:**
  - real Arabic quality (the card does not name Arabic);
  - latency at low reasoning effort against G's 25s and the applicant path's 20s budgets.
- **Fallback candidate: `google/gemma-4-31b-it`.** Dense, smaller, and broadly multilingual.
  - It is a manual swap through `NVIDIA_MODEL`, not an automatic second model: the product makes exactly one call, and CLAUDE.md §9 forbids a second provider without the owner.
  - JSON compliance is not documented, so it must pass the same checks.

## Owner setup for the live checks (the key never leaves your control)

Pick **one** of these:

1. **In this Claude cloud environment.**
   - Add the key as a network secret for host `integrate.api.nvidia.com`, with header `Authorization: Bearer`, in the environment's settings (or accept the secure form when asked). The proxy then adds it to requests. It is never written to a file, a commit or the chat, and Claude never sees it.
   - The isolated app is then started with a placeholder `NVIDIA_API_KEY` (the proxy replaces it), `NVIDIA_MODEL=mistralai/mistral-large-4-1t-a52b`, `NVIDIA_REASONING_EFFORT=low` and the mode file set to `live`.
2. **On your own machine.** Use step 1 below with `read -rs` (nothing is echoed or stored), then step 2 with the same two variables.

**Then run, in order:**
1. `scripts/check-nvidia.mjs`.
2. `g-ai-live.mjs`: checks 1–2.
3. `g-ai-live-phase1.mjs` with `REPORT=<file>`: checks 3–7. It writes each case's category, expected behaviour, observed reply, engine, latency and result. PASS/FAIL covers what a script can check; REVIEW means a person reads the reply.

Never paste the key into a chat, an issue or a file in the repository.

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
