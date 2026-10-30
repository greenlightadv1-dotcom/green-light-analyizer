import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildNegotiationReply,
  counterFigure,
  holdFigure,
  quotedRange,
  determineStage,
  extractCampaignScope,
  readPrivateMinimum,
  revealsPrivateMinimum,
  suggestRate,
  summarizeThread,
  type CampaignScope,
  type NegotiationReplyInput,
  type NegotiationStage,
  type RateKit,
  type ThreadSummary,
} from "./negotiation.ts";

/** Part 2: creator pricing and staged negotiation. No network, no database. */

const NOW = new Date("2026-10-30T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const CREATOR = "creator-1";

const KIT: RateKit = {
  platform: "youtube",
  avg_views: 50_000,
  engagement_rate: 4,
  content_category: "tech",
  subscriber_count: 120_000,
  channel_view_count: 9_000_000,
  media_count: 300,
  last_synced_at: daysAgo(3),
  audience_verified: true,
  verified_geo_synced_at: daysAgo(3),
};

const NO_SCOPE: CampaignScope = extractCampaignScope([]);

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  sponsorTexts: [],
  latestSponsorText: "",
  creatorMessageCount: 0,
  creatorQuotedUsd: null,
  sponsorOfferUsd: null,
  ...over,
});

// --- scope ---------------------------------------------------------------------

test("scope: deliverables, usage rights, exclusivity and timeline are read from the sponsor's words", () => {
  const scope = extractCampaignScope([
    "We'd like 2 dedicated videos and 3 stories, plus 6 months of paid usage for ads. 30 days exclusivity in fintech. Launch on Nov 20.",
  ]);
  assert.equal(scope.deliverableCount, 3);
  assert.equal(scope.paidUsageRequested, true);
  assert.equal(scope.usageMonths, 6);
  assert.equal(scope.exclusivityRequested, true);
  assert.equal(scope.exclusivityDays, 30);
  assert.equal(scope.timelineStated, true);
});

test("scope: unknown stays unknown — nothing is assumed from silence", () => {
  assert.deepEqual(extractCampaignScope(["Hi, we love your channel! Interested in a collab?"]), {
    deliverableCount: null,
    paidUsageRequested: false,
    usageMonths: null,
    exclusivityRequested: false,
    exclusivityDays: null,
    timelineStated: false,
  });
  assert.equal(extractCampaignScope(["usage rights in perpetuity"]).usageMonths, Infinity);
});

// --- the rate --------------------------------------------------------------------

test("rate: fresh analytics produce a target with every factor labelled", () => {
  const r = suggestRate({ kit: KIT, sponsorshipType: "video_dedicated", scope: NO_SCOPE, baseRateUsd: null, now: NOW });
  assert.equal(r.basis, "analytics");
  assert.ok(r.targetUsd && r.targetUsd > 0);
  assert.ok(r.rangeUsd && r.rangeUsd.low < r.targetUsd! && r.rangeUsd.high > r.targetUsd!);
  const byLabel = Object.fromEntries(r.factors.map((f) => [f.label, f.provenance]));
  assert.equal(byLabel["Average views"], "self_reported");
  assert.equal(byLabel["Subscribers"], "synced");
  assert.equal(byLabel["Audience geography"], "verified");
  assert.ok(r.assumptions.some((a) => /placeholder benchmark, not market data/.test(a)));
  assert.ok(r.missing.includes("number of deliverables"));
});

test("rate: stale verified geography and stale stats are not presented as measured", () => {
  const stale = { ...KIT, last_synced_at: daysAgo(45), verified_geo_synced_at: daysAgo(45), avg_views: null };
  const r = suggestRate({ kit: stale, sponsorshipType: "integration", scope: NO_SCOPE, baseRateUsd: null, now: NOW });
  assert.equal(r.targetUsd, null, "no fresh reach and no base rate: no figure");
  assert.equal(r.basis, "none");
  assert.ok(r.missing.includes("average views"));
  assert.ok(!r.factors.some((f) => f.provenance === "verified" || f.provenance === "synced"));
});

test("rate: synced lifetime stats give a labelled estimate when no average is entered", () => {
  const r = suggestRate({ kit: { ...KIT, avg_views: null }, sponsorshipType: "integration", scope: NO_SCOPE, baseRateUsd: null, now: NOW });
  assert.equal(r.basis, "analytics");
  assert.equal(r.factors.find((f) => f.label.startsWith("Average views"))?.provenance, "estimated");
});

test("rate: no analytics at all — falls back to the stated base rate, else returns no figure", () => {
  const empty: RateKit = { ...KIT, avg_views: null, engagement_rate: null, subscriber_count: null, channel_view_count: null, media_count: null, audience_verified: false };
  const withBase = suggestRate({ kit: empty, sponsorshipType: "post", scope: NO_SCOPE, baseRateUsd: 400, now: NOW });
  assert.equal(withBase.basis, "base_rate");
  assert.equal(withBase.targetUsd, 400);
  const none = suggestRate({ kit: null, sponsorshipType: "post", scope: NO_SCOPE, baseRateUsd: null, now: NOW });
  assert.equal(none.targetUsd, null);
  assert.equal(none.rangeUsd, null);
});

test("rate: scope the sponsor asked for raises the target, each uplift labelled an assumption", () => {
  const plain = suggestRate({ kit: KIT, sponsorshipType: "integration", scope: NO_SCOPE, baseRateUsd: null, now: NOW });
  const scoped = suggestRate({
    kit: KIT,
    sponsorshipType: "integration",
    scope: extractCampaignScope(["2 integrations with paid usage and 60 days exclusivity"]),
    baseRateUsd: null,
    now: NOW,
  });
  assert.ok(scoped.targetUsd! > plain.targetUsd! * 2, "two deliverables plus rights and exclusivity");
  assert.ok(scoped.assumptions.some((a) => /Usage rights add 30%/.test(a)));
  assert.ok(scoped.assumptions.some((a) => /Exclusivity adds 30%/.test(a)));
  assert.equal(scoped.factors.find((f) => f.label === "Deliverables requested")?.provenance, "sponsor_stated");
});

// --- the thread ---------------------------------------------------------------------

test("thread: system summaries are skipped; a pasted analyzer offer counts as the sponsor's", () => {
  const t = summarizeThread(
    [
      { sender_id: CREATOR, message_text: "Hi! We'd like a video. Budget $800." }, // pasted
      { sender_id: null, message_text: "Deal Co-Pilot — YELLOW\n\nRecommended: $2,000" },
    ],
    CREATOR,
    { hasCompanyAccount: false, recordedOfferUsd: 800 },
  );
  assert.equal(t.creatorMessageCount, 0);
  assert.equal(t.sponsorOfferUsd, 800);
  assert.ok(!t.sponsorTexts.some((x) => x.startsWith("Deal Co-Pilot")));
});

test("thread: the sponsor's latest stated figure wins over the recorded one", () => {
  const t = summarizeThread(
    [
      { sender_id: null, message_text: "Offer: $800 for one video" },
      { sender_id: CREATOR, message_text: "My rate would be $1,500." },
      { sender_id: null, message_text: "We can stretch to $1,100." },
    ],
    CREATOR,
    { hasCompanyAccount: false, recordedOfferUsd: 800 },
  );
  assert.equal(t.creatorMessageCount, 1);
  assert.equal(t.creatorQuotedUsd, 1500);
  assert.equal(t.sponsorOfferUsd, 1100);
});

// --- stages ---------------------------------------------------------------------------

const stage = (over: Partial<Parameters<typeof determineStage>[0]>): NegotiationStage =>
  determineStage({ dealStatus: "new", thread: thread(), scope: NO_SCOPE, targetUsd: 1500, privateMinimumUsd: null, ...over });

test("stage: the first reply explores scope and budget, even when an amount was offered", () => {
  assert.equal(stage({}), "discovery");
  assert.equal(stage({ thread: thread({ sponsorOfferUsd: 800 }) }), "discovery");
});

test("stage: the first reply can propose when the sponsor already gave budget and scope", () => {
  const scope = extractCampaignScope(["2 videos"]);
  assert.equal(stage({ scope, thread: thread({ sponsorOfferUsd: 800 }) }), "counter");
  assert.equal(stage({ scope, thread: thread({ sponsorOfferUsd: 2000 }) }), "accept_ready");
});

test("stage: later replies adapt to the sponsor's response", () => {
  const replied = { creatorMessageCount: 1 };
  assert.equal(stage({ thread: thread({ ...replied }) }), "proposal");
  assert.equal(stage({ thread: thread({ ...replied, sponsorOfferUsd: 900 }) }), "counter");
  assert.equal(stage({ thread: thread({ ...replied, sponsorOfferUsd: 1500 }) }), "accept_ready", "at target");
  assert.equal(stage({ thread: thread({ ...replied, sponsorOfferUsd: 1499 }) }), "counter", "just below target");
  assert.equal(stage({ thread: thread({ ...replied, sponsorOfferUsd: 400 }), privateMinimumUsd: 600 }), "hold");
  assert.equal(stage({ thread: thread({ ...replied, sponsorOfferUsd: 600 }), privateMinimumUsd: 600 }), "counter", "at the minimum");
});

test("stage: no analytics-based target keeps asking instead of inventing a price", () => {
  assert.equal(stage({ targetUsd: null, thread: thread({ creatorMessageCount: 3, sponsorOfferUsd: 900 }) }), "discovery");
});

test("stage: an agreed or paid deal only talks logistics", () => {
  assert.equal(stage({ dealStatus: "agreed", thread: thread({ sponsorOfferUsd: 10 }) }), "agreed");
  assert.equal(stage({ dealStatus: "paid" }), "agreed");
});

// --- replies ----------------------------------------------------------------------------

const reply = (over: Partial<NegotiationReplyInput>): NegotiationReplyInput => ({
  stage: "discovery",
  sponsorshipType: "video_dedicated",
  scope: NO_SCOPE,
  targetUsd: 1500,
  rangeUsd: { low: 1280, high: 1880 },
  sponsorOfferUsd: null,
  creatorQuotedUsd: null,
  privateMinimumUsd: null,
  ...over,
});

test("discovery reply asks about scope, deliverables, usage rights and budget — and names no price", () => {
  const text = buildNegotiationReply(reply({ sponsorOfferUsd: 800 }));
  for (const word of [/deliverables/, /usage rights/, /budget range/, /exclusivity/, /timeline/]) assert.match(text, word);
  assert.ok(!/\$\d/.test(text), "no figure before scope is known");
});

test("discovery only asks for what the sponsor has not already said", () => {
  const text = buildNegotiationReply(reply({ scope: extractCampaignScope(["2 videos, 3 months paid usage, launch by next month"]) }));
  assert.ok(!/deliverables/.test(text));
  assert.ok(!/usage rights/.test(text));
  assert.match(text, /budget range/);
});

test("proposal quotes the range and asks for the budget; counter states a figure; accept never commits", () => {
  assert.match(buildNegotiationReply(reply({ stage: "proposal" })), /\$1,280–\$1,880[\s\S]*What budget/);
  const counter = buildNegotiationReply(reply({ stage: "counter", sponsorOfferUsd: 900 }));
  assert.match(counter, /\$1,500 rather than \$900/);
  const accept = buildNegotiationReply(reply({ stage: "accept_ready", sponsorOfferUsd: 1600 }));
  assert.match(accept, /could work/);
  assert.match(accept, /Before I confirm/);
  assert.ok(!/\b(I accept|deal is confirmed|agreed)\b/i.test(accept));
});

test("counter figure: target first; halfway after the creator has quoted; never below the minimum or the offer", () => {
  assert.equal(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 900 })), 1500);
  assert.equal(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 1100, creatorQuotedUsd: 1500 })), 1300);
  // Halfway (1,300) would undercut the minimum: back to the target, not to the minimum itself.
  assert.equal(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 1100, creatorQuotedUsd: 1500, privateMinimumUsd: 1400 })), 1500);
  // A minimum above the target: 10% above it, rounded — never the minimum itself.
  assert.equal(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 900, privateMinimumUsd: 1800 })), 2000);
  assert.equal(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 900, privateMinimumUsd: 1500 })), 1700, "target equal to the minimum is not used");
  assert.ok(counterFigure(reply({ stage: "counter", sponsorOfferUsd: 1490, creatorQuotedUsd: 1200 }))! >= 1490);
});

// --- privacy of the private minimum ----------------------------------------------------------

test("no stage's deterministic reply ever contains the private minimum", () => {
  const minimum = 1234;
  for (const s of ["discovery", "proposal", "counter", "hold", "accept_ready", "agreed"] as const) {
    for (const offer of [null, 500, 1300, 2000]) {
      const input = reply({ stage: s, sponsorOfferUsd: offer, privateMinimumUsd: minimum, creatorQuotedUsd: offer ? 1500 : null });
      const text = buildNegotiationReply(input);
      const q = quotedRange(input);
      const publicFigures = [offer, counterFigure(input), holdFigure(input), q?.low ?? null, q?.high ?? null];
      assert.equal(revealsPrivateMinimum(text, minimum, publicFigures), false, `${s} / ${offer}: ${text}`);
      assert.ok(!text.includes("1,234") && !text.includes("1234"), `${s} / ${offer}`);
    }
  }
});

test("leak detection catches the minimum in any common written form", () => {
  for (const draft of ["My floor is $1,200.", "I can go as low as 1200", "lowest 1.200 USD", "1.2k is my minimum", "١٢٠٠ دولار"]) {
    assert.equal(revealsPrivateMinimum(draft, 1200), true, draft);
  }
  assert.equal(revealsPrivateMinimum("My rate is $1,500.", 1200), false);
  assert.equal(revealsPrivateMinimum("You offered $1,200.", 1200, [1200]), false, "the sponsor's own figure is public");
  assert.equal(revealsPrivateMinimum("anything", null), false);
});

test("the private minimum input is validated and forged shapes are dropped", () => {
  assert.equal(readPrivateMinimum("1200"), 1200);
  assert.equal(readPrivateMinimum("$1,200"), 1200);
  assert.equal(readPrivateMinimum(" 1.200 "), 1200);
  for (const bad of ["", "  ", "-5", "0", "1e9", "abc", "2000000", null, undefined, 1200, { valueOf: () => 1200 }]) {
    assert.equal(readPrivateMinimum(bad), null, String(bad));
  }
});

test("quoted ranges and held rates never sit at or under the private minimum", () => {
  for (const minimum of [500, 1280, 1500, 1880, 2500]) {
    const input = reply({ stage: "proposal", privateMinimumUsd: minimum });
    const range = quotedRange(input)!;
    assert.ok(range.low > minimum && range.high > range.low, `range for ${minimum}`);
    const hold = holdFigure(reply({ stage: "hold", sponsorOfferUsd: 100, privateMinimumUsd: minimum }))!;
    assert.ok(hold > minimum, `hold for ${minimum}`);
    for (const s of ["proposal", "hold"] as const) {
      const text = buildNegotiationReply(reply({ stage: s, sponsorOfferUsd: s === "hold" ? 100 : null, privateMinimumUsd: minimum }));
      assert.equal(revealsPrivateMinimum(text, minimum, [100]), false, `${s} ${minimum}: ${text}`);
    }
  }
  assert.deepEqual(quotedRange(reply({ stage: "proposal" })), { low: 1280, high: 1880 }, "unchanged without a minimum");
});
