#!/usr/bin/env node
/**
 * Prints how long the inbound parsers take on adversarial, sender-controlled
 * input (review Finding 1). Informational: parse.test.ts enforces loose
 * ceilings; this shows the real numbers, so a regression toward quadratic
 * growth is visible as the size column grows (linear: ~6× time for 6× input).
 *
 *   node --experimental-strip-types scripts/parse-perf-check.mjs
 *
 * Before the fix, on a laptop: 80k newlines in stripQuotedReply ≈ 16s,
 * 320k ≈ 246s; 160k of "<a" in htmlToText ≈ 5.7s.
 */
import {
  buildOfferText,
  htmlToText,
  normalizeInboundEmail,
  stripQuotedReply,
} from "../src/lib/email/parse.ts";

const time = (f) => {
  const started = performance.now();
  f();
  return (performance.now() - started).toFixed(1).padStart(7);
};

const cases = [
  ["html", "<a"], ["html", "<style "], ["html", "<script>"], ["html", "<script></script"], ["html", "<br  "],
  ["text", "\n"], ["text", " \n"], ["text", "On x\n"], ["text", "From: \n"],
];

console.log("kind  unit                 size     raw ms  capped-path ms");
for (const [kind, unit] of cases) {
  for (const size of [160_000, 1_000_000]) {
    const input = unit.repeat(Math.ceil(size / unit.length));
    const raw = time(() => (kind === "html" ? htmlToText(input) : stripQuotedReply(input)));
    const path = time(() => buildOfferText(normalizeInboundEmail({ email_id: "x", subject: "s", [kind]: input })));
    console.log(`${kind}  ${JSON.stringify(unit).padEnd(20)} ${String(size).padStart(8)} ${raw} ${path}`);
  }
}
