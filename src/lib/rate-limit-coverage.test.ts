import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Every server action that spends money, shared provider quota, or another
 * party's inbox must consume its rate limit. The actions import "server-only"
 * and cannot run here, so this checks the source, the way config.test.ts does:
 * crude, but it fails the moment someone deletes or renames the call.
 */

const SRC = new URL("../", import.meta.url);

function functionBody(file: string, name: string): string {
  const source = readFileSync(new URL(file, SRC), "utf8");
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start !== -1, `${name} not found in ${file}`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const GUARDED: [file: string, fn: string, action: string][] = [
  ["app/(app)/analyzer/actions.ts", "analyzeOffer", "ai_analyze_offer"],
  ["app/(app)/analyzer/actions.ts", "createDealFromAnalysis", "analyzer_create_deal"],
  ["app/(app)/discover/actions.ts", "previewOfferToCreator", "ai_offer_preview"],
  ["app/(app)/discover/actions.ts", "sendOfferToCreator", "offer_send"],
  ["app/(app)/inbox/[chatId]/actions.ts", "sendMessage", "message_send"],
  ["app/(app)/inbox/[chatId]/actions.ts", "analyzeCompany", "ai_company_intel"],
  ["app/(app)/pricing/actions.ts", "redeemCode", "promo_redeem"],
  ["lib/media-kit/actions.ts", "detectNiche", "ai_detect_niche"],
  ["lib/media-kit/actions.ts", "syncYoutubeStats", "platform_sync"],
  ["lib/media-kit/actions.ts", "syncVerifiedGeo", "platform_sync"],
  ["lib/media-kit/actions.ts", "syncInstagramStats", "platform_sync"],
  ["app/api/g/route.ts", "POST", "g_chat"],
  ["app/api/uploads/avatar/route.ts", "POST", "upload"],
  ["app/api/uploads/documents/route.ts", "POST", "upload"],
  ["app/get-started/actions.ts", "submitAccessRequest", "access_request"],
  ["app/(app)/collaborations/actions.ts", "saveBrief", "collab_write"],
  ["app/(app)/shortlists/actions.ts", "createShortlist", "shortlist_write"],
  ["app/(app)/shortlists/actions.ts", "renameShortlist", "shortlist_write"],
  ["app/(app)/shortlists/actions.ts", "deleteShortlist", "shortlist_write"],
  ["app/(app)/shortlists/actions.ts", "addToShortlist", "shortlist_write"],
  ["app/(app)/shortlists/actions.ts", "removeFromShortlist", "shortlist_write"],
  ["app/(app)/portfolio/actions.ts", "savePortfolioItem", "portfolio_write"],
  ["app/(app)/portfolio/actions.ts", "deletePortfolioItem", "portfolio_write"],
  ["app/(app)/portfolio/actions.ts", "movePortfolioItem", "portfolio_write"],
  ["app/(app)/portfolio/actions.ts", "savePublicVisibility", "portfolio_write"],
  ["app/(app)/collaborations/actions.ts", "inviteCreator", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "withdrawInvitation", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "reviseInvitation", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "respondToInvitation", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "proposeTerms", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "confirmTerms", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "addDeliverable", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "removeDeliverable", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "submitDeliverable", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "reviewDeliverable", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "completeCollaboration", "collab_write"],
  ["app/(app)/collaborations/actions.ts", "cancelCollaboration", "collab_write"],
];

for (const [file, fn, action] of GUARDED) {
  test(`${fn} consumes the ${action} rate limit`, () => {
    assert.ok(
      functionBody(file, fn).includes(`consumeRateLimit("${action}"`),
      `${fn} in ${file} no longer calls consumeRateLimit("${action}", …)`,
    );
  });
}

test("reply drafting is limited on both the creator and the company path", () => {
  const actions = readFileSync(new URL("app/(app)/inbox/[chatId]/actions.ts", SRC), "utf8");
  const calls = actions.match(/consumeRateLimit\("ai_reply_draft"/g) ?? [];
  assert.ok(calls.length >= 2, "generateReply and negotiationDraft must each consume ai_reply_draft");
});

test("every guarded action has rules defined", () => {
  const rules = readFileSync(new URL("lib/rate-limit.ts", SRC), "utf8");
  for (const action of new Set(GUARDED.map(([, , a]) => a))) {
    assert.match(rules, new RegExp(`\\n  ${action}: \\[`), `no RULES entry for ${action}`);
  }
});
