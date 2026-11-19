# Live NVIDIA check (owner-run)

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
| `GET /v1/models` HTTP 200 and `✓ "<model>" is in the catalog` | Key valid, model available |
| HTTP 401 | Key rejected: a wrong value, an NGC/org key instead of a build.nvidia.com `nvapi-` key, or revoked. The script lists the likely causes |
| `✗ "<model>" is NOT in the catalog` | Every production call would 404 and G would silently use rules. Change `NVIDIA_MODEL` |
| `POST /v1/chat/completions` HTTP 200 with `content: N chars` | The model answers |
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
