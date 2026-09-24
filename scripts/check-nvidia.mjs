#!/usr/bin/env node
/**
 * Diagnose the NVIDIA connection — the one thing that cannot be determined
 * from inside the app, because every failure there degrades quietly to the
 * rule-based engine.
 *
 * It makes exactly the calls src/lib/ai/chat.ts makes, in the same shape, and
 * reports what came back:
 *
 *   1. GET  /v1/models          — is the key valid, and is NVIDIA_MODEL real?
 *   2. POST /v1/chat/completions — does the model answer, and where is its text?
 *
 * Usage:
 *   node scripts/check-nvidia.mjs
 *   NVIDIA_API_KEY=nvapi-... NVIDIA_MODEL=z-ai/glm-5.3 node scripts/check-nvidia.mjs
 *
 * Reads .env.local / .env like the other scripts here. It never prints the
 * key — only whether one was found and how it is shaped.
 */
import { readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* optional */
  }
}

const BASE = "https://integrate.api.nvidia.com/v1";
const rawKey = process.env.NVIDIA_API_KEY ?? "";
const key = rawKey.trim().replace(/^["']|["']$/g, "").trim();
const model = (process.env.NVIDIA_MODEL ?? "").trim().replace(/^["']|["']$/g, "").trim()
  || "z-ai/glm-5.3";

if (!key) {
  console.error("NVIDIA_API_KEY is not set (checked the environment, .env.local and .env).");
  process.exit(1);
}

// Shape only — never the value. A key that arrived wrapped in quotes or with a
// trailing newline is a real and very confusing cause of a 401.
console.log(`key:    found, ${key.length} chars, starts "${key.slice(0, 6)}…"`);
if (rawKey !== key) {
  console.log("        ⚠ the raw value had surrounding whitespace or quotes — stripped here,");
  console.log("          and stripped in the app too, but fix it at the source.");
}
console.log(`model:  ${model}`);
console.log("");

const headers = {
  accept: "application/json",
  "content-type": "application/json",
  authorization: `Bearer ${key}`,
};

async function detail(response) {
  try {
    const body = await response.json();
    for (const k of ["detail", "message", "title", "error"]) {
      const v = body?.[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 300);
      if (v && typeof v === "object" && typeof v.message === "string") {
        return v.message.trim().slice(0, 300);
      }
    }
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return (await response.text().catch(() => "")).slice(0, 300);
  }
}

// ---- 1. catalog -----------------------------------------------------------
console.log("1. GET /v1/models");
let catalog = null;
try {
  const response = await fetch(`${BASE}/models`, { headers });
  console.log(`   HTTP ${response.status}`);
  if (response.status === 401) {
    console.log("   → the key is rejected. Rotate it at build.nvidia.com and update the env var.");
    process.exit(1);
  }
  if (!response.ok) {
    console.log(`   → ${await detail(response)}`);
  } else {
    const body = await response.json();
    catalog = (body?.data ?? []).map((m) => m.id).filter(Boolean);
    console.log(`   ${catalog.length} models available to this key`);
    if (catalog.includes(model)) {
      console.log(`   ✓ "${model}" is in the catalog`);
    } else {
      console.log(`   ✗ "${model}" is NOT in the catalog — this is a 404 on every call,`);
      console.log("     which the app degrades to rule-based output without an error.");
      const near = catalog.filter((id) => {
        const stem = model.split("/").pop()?.split("-")[0] ?? "";
        return stem && id.toLowerCase().includes(stem.toLowerCase());
      });
      if (near.length) console.log(`     closest ids: ${near.slice(0, 10).join(", ")}`);
    }
  }
} catch (error) {
  console.log(`   network error: ${error.message}`);
  console.log("   → the host is unreachable from here (firewall, proxy, DNS).");
}
console.log("");

// ---- 2. the real call -----------------------------------------------------
console.log("2. POST /v1/chat/completions");
const payload = {
  model,
  messages: [{ role: "user", content: 'Reply with only this JSON object: {"ok": true}' }],
  temperature: 0.2,
  max_tokens: 64,
  response_format: { type: "json_object" },
};

async function chat(body, label) {
  const started = Date.now();
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ms = Date.now() - started;
  console.log(`   ${label}: HTTP ${response.status} in ${ms}ms`);
  if (!response.ok) {
    console.log(`   → ${await detail(response)}`);
    return { ok: false, status: response.status };
  }
  const json = await response.json();
  const message = json?.choices?.[0]?.message ?? {};
  const content = typeof message.content === "string" ? message.content : "";
  const reasoning =
    typeof message.reasoning_content === "string" ? message.reasoning_content : "";
  console.log(`   content: ${content ? `${content.length} chars` : "EMPTY"}`);
  if (!content && reasoning) {
    console.log(`   reasoning_content: ${reasoning.length} chars`);
    console.log("   → a reasoning model. The app reads this as a fallback; good.");
  }
  if (!content && !reasoning) {
    console.log("   → 200 with no text anywhere. Inspect the raw shape:");
    console.log(`   ${JSON.stringify(json).slice(0, 400)}`);
  }
  return { ok: true, status: response.status };
}

try {
  const first = await chat(payload, "with response_format");
  if (!first.ok && [400, 415, 422, 500].includes(first.status)) {
    const withoutJsonMode = { ...payload };
    delete withoutJsonMode.response_format;
    console.log("   retrying without response_format (the app does this too)…");
    const second = await chat(withoutJsonMode, "without response_format");
    if (second.ok) {
      console.log("   → the model does not support JSON mode. The app's retry covers it.");
    }
  }
} catch (error) {
  console.log(`   network error: ${error.message}`);
}
