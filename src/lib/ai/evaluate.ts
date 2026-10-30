import "server-only";

import type { EvaluationInput, EvaluationResult } from "./types";
import { AiUnavailableError } from "./chat";
import { log } from "@/lib/log";
import { evaluateWithModel } from "./price-model";
import { capRiskByVerification } from "./rules";
import { heuristicEvaluate } from "./heuristic";

export { capRiskByVerification, HIGH_VALUE_DEAL_USD } from "./rules";

/**
 * Deal evaluation — CLAUDE.md §5.4, §7.4.
 *
 * One entry point, shared by the Manual Analyzer (§5.1) and the inbound-email
 * webhook (§5.4), so the two can never drift apart on price.
 *
 * The engine is NVIDIA NIM, on the client's explicit instruction — §9 of the
 * spec originally named Gemini here — with the rule-based engine below it and
 * nothing in between. See price-model.ts for the §12 data-handling analysis
 * and nvidia-config.ts for how the endpoint is configured.
 */

/**
 * Price and risk-rate an offer.
 *
 * NVIDIA-hosted Kimi K3 when a key is configured, otherwise the deterministic
 * fallback above. Either way the §7.4 verification cap is applied to the
 * result, so the rule holds regardless of which engine answered.
 */
export async function evaluateOffer(
  input: EvaluationInput,
  /** An absolute deadline for the model call; see ChatRequest.deadlineAt. */
  options: { deadlineAt?: number } = {},
): Promise<EvaluationResult> {
  try {
    // No pre-flight key check: chatJson resolves the configuration and raises
    // AiUnavailableError when there is no key, so "unconfigured" and "failed"
    // arrive on the same path and are told apart by the error itself.
    const raw = await evaluateWithModel(input, options);
    const capped = capRiskByVerification(
      raw.risk,
      input.audience_verified,
      raw.recommended_price_usd,
    );

    return {
      ...raw,
      risk: capped.risk,
      risk_capped: capped.risk_capped,
      geo_basis: input.audience_verified
        ? "verified"
        : input.declared_top_countries?.length
          ? "declared"
          : "none",
      engine: "nvidia",
    };
  } catch (error) {
    // A creator waiting on an offer is better served by a rule-based number
    // than by an error. The engine field tells the UI which one they got.
    //
    // Never silent. chatJson has already logged NVIDIA's own reason (or, with
    // no key, said so once per instance); this line records that a real deal
    // was actually priced by rules. Skipped for the unconfigured case, where
    // that is simply how the deployment runs and the line would repeat on
    // every offer. Every message involved is a status code or a shape
    // complaint, never a response body, so nothing here can carry offer text
    // into a log (§12).
    if (!(error instanceof AiUnavailableError && error.unconfigured)) {
      log.warn("pricing.heuristic_fallback", { error });
    }
    return heuristicEvaluate(input);
  }
}
