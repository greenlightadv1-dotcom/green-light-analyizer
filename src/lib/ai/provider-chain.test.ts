import test from "node:test";
import assert from "node:assert/strict";

import {
  GROQ_DEFAULT_MODEL,
  GROQ_ENDPOINT,
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_ENDPOINT,
  chainBudgetMs,
  resolveProviders,
} from "./provider-chain.ts";

test("NVIDIA is primary and Groq is the fallback, in that order", () => {
  const chain = resolveProviders({ NVIDIA_API_KEY: "n", GROQ_API_KEY: "g" });
  assert.deepEqual(chain.map((p) => p.name), ["nvidia", "groq"]);
});

test("a provider with no key is absent from the chain, not a failing member", () => {
  const chain = resolveProviders({ NVIDIA_API_KEY: "n" });
  assert.deepEqual(chain.map((p) => p.name), ["nvidia"]);
});

test("Groq alone becomes the primary, with no further configuration", () => {
  // The case that makes a key-presence pre-flight check in the caller wrong:
  // a deployment holding only a Groq key must still get AI pricing.
  const chain = resolveProviders({ GROQ_API_KEY: "g" });
  assert.deepEqual(chain.map((p) => p.name), ["groq"]);
  assert.equal(chain[0].model, GROQ_DEFAULT_MODEL);
});

test("no keys means an empty chain, which is a supported state", () => {
  assert.deepEqual(resolveProviders({}), []);
});

test("a whitespace-only key counts as absent", () => {
  // Pasting an empty value into a Vercel env var is a real way to get here,
  // and a blank Bearer token fails every request at the provider instead.
  assert.deepEqual(resolveProviders({ NVIDIA_API_KEY: "   ", GROQ_API_KEY: "g" }).map((p) => p.name), [
    "groq",
  ]);
});

test("endpoints and default models are the documented ones", () => {
  const [nvidia, groq] = resolveProviders({ NVIDIA_API_KEY: "n", GROQ_API_KEY: "g" });
  assert.equal(nvidia.endpoint, NVIDIA_ENDPOINT);
  assert.equal(nvidia.model, NVIDIA_DEFAULT_MODEL);
  assert.equal(groq.endpoint, GROQ_ENDPOINT);
  assert.equal(groq.model, GROQ_DEFAULT_MODEL);
});

test("each model is overridable independently", () => {
  const [nvidia, groq] = resolveProviders({
    NVIDIA_API_KEY: "n",
    NVIDIA_MODEL: "some/other-model",
    GROQ_API_KEY: "g",
    GROQ_MODEL: "llama-3.1-8b-instant",
  });
  assert.equal(nvidia.model, "some/other-model");
  assert.equal(groq.model, "llama-3.1-8b-instant");
});

test("reasoning_effort rides on NVIDIA only — Groq's Llama models reject it", () => {
  const [nvidia, groq] = resolveProviders({
    NVIDIA_API_KEY: "n",
    NVIDIA_REASONING_EFFORT: "high",
    GROQ_API_KEY: "g",
  });
  assert.deepEqual(nvidia.extraBody, { reasoning_effort: "high" });
  assert.equal(groq.extraBody, undefined);
});

test("no reasoning_effort field at all when the env var is unset", () => {
  const [nvidia] = resolveProviders({ NVIDIA_API_KEY: "n" });
  assert.equal(nvidia.extraBody, undefined);
});

test("the whole chain fits inside a 60s serverless budget", () => {
  // Load-bearing: if the platform kills the function mid-first-attempt, the
  // fallback provider is never reached and the failover is decorative.
  const budget = chainBudgetMs(resolveProviders({ NVIDIA_API_KEY: "n", GROQ_API_KEY: "g" }));
  assert.ok(budget <= 60_000, `chain budget was ${budget}ms`);
  assert.ok(budget > 0);
});
