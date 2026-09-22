import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectReply,
  buildOfferContextBlock,
  buildReplyTemplate,
} from "./reply-template.ts";

const base = {
  creatorName: "Nour",
  offeredAmountUsd: null,
  recommendedPriceUsd: null,
  sponsorshipType: null,
  dealStatus: "new" as const,
};

test("counters when the offer is well under the recommendation", () => {
  const text = buildReplyTemplate({
    ...base,
    offeredAmountUsd: 800,
    recommendedPriceUsd: 2100,
    sponsorshipType: "video_dedicated",
  });
  assert.match(text, /\$2,100/);
  assert.match(text, /dedicated video/);
});

test("accepts when the offer meets or beats the recommendation", () => {
  const text = buildReplyTemplate({
    ...base,
    offeredAmountUsd: 2400,
    recommendedPriceUsd: 2200,
    sponsorshipType: "integration",
  });
  assert.match(text, /\$2,400/);
  assert.doesNotMatch(text, /rather than/);
});

test("a near-miss is closed at the recommended price rather than countered hard", () => {
  const text = buildReplyTemplate({
    ...base,
    offeredAmountUsd: 1950,
    recommendedPriceUsd: 2100,
    sponsorshipType: "post",
  });
  assert.match(text, /close/);
  assert.match(text, /\$2,100/);
});

test("asks for a budget when neither side has named a figure", () => {
  const text = buildReplyTemplate({ ...base, sponsorshipType: "story_share" });
  assert.match(text, /budget/i);
});

test("quotes the rate when only the platform has a figure", () => {
  const text = buildReplyTemplate({ ...base, recommendedPriceUsd: 1500 });
  assert.match(text, /\$1,500/);
});

test("never writes a contact detail or an off-platform link", () => {
  // §6 would mask these anyway; a template that writes text the platform then
  // redacts would read as the product fighting itself.
  for (const input of [
    { ...base, offeredAmountUsd: 500, recommendedPriceUsd: 2000 },
    { ...base, offeredAmountUsd: 3000, recommendedPriceUsd: 2000 },
    { ...base },
  ]) {
    const text = buildReplyTemplate(input);
    assert.doesNotMatch(text, /@|https?:\/\/|whatsapp|telegram|discord/i);
  }
});

test("the context block states only figures the deal actually carries", () => {
  const sparse = buildOfferContextBlock(base);
  assert.doesNotMatch(sparse, /offer|rate/i);

  const full = buildOfferContextBlock({
    ...base,
    offeredAmountUsd: 900,
    recommendedPriceUsd: 1400,
  });
  assert.match(full, /Your offer: \$900/);
  assert.match(full, /My rate: \$1,400/);
});

test("the direct reply puts the context above the message", () => {
  const text = buildDirectReply({
    ...base,
    offeredAmountUsd: 900,
    recommendedPriceUsd: 1400,
    sponsorshipType: "live_mention",
  });
  assert.ok(text.indexOf("Deliverable:") < text.indexOf("Thanks for reaching out"));
});

test("a follow-up does not open as if it were the first contact", () => {
  const text = buildReplyTemplate({ ...base, dealStatus: "negotiating", recommendedPriceUsd: 1000 });
  assert.doesNotMatch(text, /reaching out/);
});
