import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEWS_SOURCES, allowedUrl, newsEnabled, parseRss, parseSteam, relevantNews, sourceUrl } from "./sources.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const yt = NEWS_SOURCES.find((s) => s.id === "youtube_blog")!;
const cs = NEWS_SOURCES.find((s) => s.id === "steam_cs2")!;

test("RSS (real YouTube Official Blog payload): headline, link, date; off-domain links dropped", () => {
  const items = parseRss(yt, fixture("youtube-blog.xml"));
  assert.equal(items.length, 2, "the evil.example item is dropped");
  assert.equal(items[0].title, "New accessibility tags come to YouTube Playables");
  assert.equal(items[0].url, "https://blog.youtube/news-and-events/new-accessibility-tags-youtube-playables/");
  assert.equal(items[0].published_at, "2026-11-02T20:00:00.000Z");
  assert.equal(items[1].title, "5 ways media companies are growing audiences & revenue on YouTube", "entities decoded");
  assert.ok(items.every((i) => !("description" in i) && !("contents" in i)), "no article text is kept");
});

test("Steam (real GetNewsForApp payload): only the developer's own announcements", () => {
  const items = parseSteam(cs, JSON.parse(fixture("steam-730.json")));
  assert.equal(items.length, 1, "the third-party press item is dropped");
  assert.equal(items[0].title, "Counter-Strike 2 Update");
  assert.equal(items[0].external_id, "1847920302232686");
  assert.match(items[0].url, /^https:\/\/steamstore-a\.akamaihd\.net\/news\/externalpost\/steam_community_announcements\//);
  assert.equal(items[0].published_at, new Date(1793224089 * 1000).toISOString());
  assert.deepEqual(items[0].tags, ["counter_strike", "gaming", "esports"]);
});

test("links must be https on the source's own hosts", () => {
  assert.equal(allowedUrl("http://blog.youtube/x", ["blog.youtube"]), null);
  assert.equal(allowedUrl("https://blog.youtube.evil.example/x", ["blog.youtube"]), null);
  assert.equal(allowedUrl("javascript:alert(1)", ["blog.youtube"]), null);
  assert.ok(allowedUrl("https://blog.youtube/a", ["blog.youtube"]));
});

test("malformed feeds produce nothing rather than invented items", () => {
  assert.deepEqual(parseRss(yt, "<rss><item><title>No link</title></item></rss>"), []);
  assert.deepEqual(parseRss(yt, "not xml at all"), []);
  assert.deepEqual(parseSteam(cs, { appnews: { newsitems: [{ feedname: "steam_community_announcements", title: "t", url: "https://store.steampowered.com/x" }] } }), [], "no date, no item");
  assert.deepEqual(parseSteam(cs, null), []);
});

test("sources are official https endpoints; the feature is off unless enabled", () => {
  for (const s of NEWS_SOURCES) assert.match(sourceUrl(s), /^https:\/\/(blog\.youtube|api\.steampowered\.com)\//);
  assert.equal(newsEnabled({}), false);
  assert.equal(newsEnabled({ NEWS_MONITORING_ENABLED: "true" }), false);
  assert.equal(newsEnabled({ NEWS_MONITORING_ENABLED: "1" }), true);
});

test("relevance is by shared taxonomy tags only", () => {
  const items = [{ tags: ["counter_strike"] }, { tags: ["platform_youtube"] }, { tags: ["dota2"] }];
  assert.equal(relevantNews(items, ["counter_strike", "platform_youtube"]).length, 2);
  assert.equal(relevantNews(items, []).length, 0);
});
