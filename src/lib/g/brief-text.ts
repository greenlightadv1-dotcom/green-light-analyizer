import type { ContentCategory, ContentFormat, GameId } from "../taxonomy.ts";
import type { Brief } from "./recommend.ts";
import type { Platform } from "../types/database.ts";

/**
 * Company AI creator search, deterministic half: read the search criteria a
 * company wrote in its own words ("Egyptian gaming creators who stream
 * Valorant, budget $2,000") into the structured Brief that recommendCreators()
 * already ranks the real directory against. Works with no model at all, so
 * search never depends on NVIDIA being up; the model only words the answer.
 *
 * Only words it recognises become criteria. Nothing is guessed: an unknown
 * game or country is simply not a criterion, and missingBriefFields() then
 * tells the company what to add. English and Arabic keywords. Pure.
 */

const CATEGORY_WORDS: [ContentCategory, RegExp][] = [
  ["esports", /\besports?\b|e-sports?|competitive gam|رياضات? إلكترونية|إيسبورت/i],
  ["gaming", /\bgam(e|er|ers|ing)\b|\bstream(er|ers|ing)? games?\b|ألعاب|جيمنج|جيمر|قيمر/i],
  ["tech", /\btech(nology)?\b|\bgadgets?\b|تقنية|تكنولوجيا/i],
  ["fitness", /\bfitness\b|\bgym\b|\bworkout\b|لياقة|جيم\b|رياضة بدنية/i],
  ["beauty", /\bbeauty\b|\bmake-?up\b|\bskincare\b|تجميل|مكياج/i],
  ["finance", /\bfinance\b|\binvest(ing|ment)?\b|\bcrypto\b|مال(ية)?|استثمار/i],
  ["food", /\bfood\b|\bcooking\b|\brecipes?\b|طبخ|أكل|طعام/i],
  ["travel", /\btravel\b|سفر|سياحة/i],
  ["music", /\bmusic\b|موسيقى|أغاني/i],
  ["education", /\beducation(al)?\b|\blearning\b|تعليم/i],
  ["lifestyle", /\blifestyle\b|\bvlogs?\b|لايف ?ستايل|فلوج/i],
  ["entertainment", /\bentertainment\b|\bcomedy\b|ترفيه|كوميدي/i],
];

const GAME_WORDS: [GameId, RegExp][] = [
  ["valorant", /\bvalorant\b|فالورانت/i],
  ["counter_strike", /\bcs:?go\b|\bcs ?2\b|counter[- ]?strike|كاونتر/i],
  ["league_of_legends", /league of legends|\blol\b(?! *:)/i],
  ["dota2", /\bdota ?2?\b|دوتا/i],
  ["fortnite", /\bfortnite\b|فورتنايت/i],
  ["minecraft", /\bminecraft\b|ماينكرافت/i],
  ["gta", /\bgta\b|grand theft auto/i],
  ["call_of_duty", /call of duty|\bcod\b|\bwarzone\b|كول أوف ديوتي/i],
  ["pubg", /\bpubg\b|ببجي|بوبجي/i],
  ["free_fire", /free ?fire|فري ?فاير/i],
  ["roblox", /\broblox\b|روبلوكس/i],
  ["ea_fc", /\bea ?(sports )?fc\b|\bfifa\b|فيفا/i],
  ["apex_legends", /\bapex\b/i],
  ["rocket_league", /rocket league/i],
  ["mobile_legends", /mobile legends|\bmlbb\b/i],
  ["genshin_impact", /\bgenshin\b/i],
];

const PLATFORM_WORDS: [Platform, RegExp][] = [
  ["youtube", /\byoutube\b|\byt\b|يوتيوب/i],
  ["twitch", /\btwitch\b|تويتش/i],
  ["kick", /\bkick\b|كيك/i],
  ["instagram", /\binstagram\b|\binsta\b|\breels?\b|إنستغرام|انستجرام|انستا/i],
];

const FORMAT_WORDS: [ContentFormat, RegExp][] = [
  ["live_stream", /\bstream(s|ing|er|ers)?\b|\blive\b|بث مباشر|لايف/i],
  ["short_video", /\bshorts?\b|\breels?\b|\btiktoks?\b|فيديو قصير/i],
  ["long_video", /\blong[- ]?form\b|\bvideos?\b|فيديو/i],
  ["reviews", /\breviews?\b|مراجع(ة|ات)|ريفيو/i],
  ["tutorials", /\btutorials?\b|\bhow[- ]to\b|شروحات|شرح/i],
  ["podcast", /\bpodcasts?\b|بودكاست/i],
];

/** Country words → ISO codes. MENA first, since it is the primary market. */
const COUNTRY_WORDS: [string, RegExp][] = [
  ["EG", /\begypt(ian)?s?\b|مصر|مصري/i],
  ["SA", /\bsaudi( arabia)?\b|\bksa\b|السعودية|سعودي/i],
  ["AE", /\buae\b|emirat(es|i)|الإمارات|إماراتي/i],
  ["KW", /\bkuwait(i)?\b|الكويت|كويتي/i],
  ["QA", /\bqatar(i)?\b|قطر|قطري/i],
  ["MA", /\bmorocc(o|an)\b|المغرب|مغربي/i],
  ["JO", /\bjordan(ian)?\b|الأردن|أردني/i],
  ["IQ", /\biraq(i)?\b|العراق|عراقي/i],
  ["DZ", /\balgeria(n)?\b|الجزائر|جزائري/i],
  ["TN", /\btunisia(n)?\b|تونس|تونسي/i],
  ["US", /\bunited states\b|\busa\b|\bamerican\b|أمريكا/i],
  ["GB", /\buk\b|united kingdom|\bbritish\b|بريطانيا/i],
];

const ARABIC_DIGITS = /[٠-٩]/g;
const digits = (s: string) => s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x660));

function amount(raw: string, unit: string | undefined): number {
  const n = Number(raw.replace(/[, ]/g, ""));
  const u = (unit ?? "").toLowerCase();
  return u === "k" || u === "ألف" ? n * 1_000 : u === "m" || u === "مليون" ? n * 1_000_000 : n;
}

export type ExtractedBrief = { brief: Partial<Brief>; understood: string[] };

export function briefFromText(input: string): ExtractedBrief {
  const text = digits(input);
  const pick = <T,>(pairs: [T, RegExp][]) => pairs.filter(([, re]) => re.test(text)).map(([id]) => id);
  const games = pick(GAME_WORDS);
  let categories = pick(CATEGORY_WORDS);
  // A named game implies gaming even if the word was not used.
  if (games.length && !categories.includes("gaming") && !categories.includes("esports")) categories = ["gaming", ...categories];
  const brief: Partial<Brief> = {};
  const understood: string[] = [];
  if (categories.length) {
    brief.categories = categories.slice(0, 6);
    understood.push("categories");
  }
  if (games.length) {
    brief.games = games.slice(0, 12);
    understood.push("games");
  }
  const platforms = pick(PLATFORM_WORDS);
  if (platforms.length) {
    brief.platforms = platforms;
    understood.push("platforms");
  }
  const countries = pick(COUNTRY_WORDS);
  if (countries.length) {
    brief.countries = countries.slice(0, 10);
    understood.push("countries");
  }
  const formats = pick(FORMAT_WORDS);
  if (formats.length) {
    brief.formats = formats.slice(0, 8);
    understood.push("formats");
  }

  const budget =
    /(?:budget|up to|max(?:imum)?|ميزانية|حتى)[^0-9$]{0,12}\$?\s?([\d][\d,]{0,12})\s?(k\b|m\b|ألف|مليون)?/i.exec(text) ??
    /\$\s?([\d][\d,]{0,12})\s?(k\b|m\b)?/i.exec(text);
  if (budget) {
    const v = amount(budget[1], budget[2]);
    if (Number.isFinite(v) && v > 0 && v <= 1e8) {
    brief.maxBudgetUsd = v;
    understood.push("budget");
  }
  }
  const views = /(?:at least|min(?:imum)?|over|more than|أكثر من|على الأقل)\s*([\d][\d,]{0,12})\s?(k|m|ألف|مليون)?\s*(?:avg\.? |average )?(?:views|مشاهدة|مشاهدات)/i.exec(text);
  if (views) {
    const v = amount(views[1], views[2]);
    if (Number.isFinite(v) && v > 0 && v <= 1e9) {
    brief.minAvgViews = v;
    understood.push("min_views");
  }
  }
  return { brief, understood };
}

/** Fill only the fields the company has not already set in the structured brief. */
export function mergeBrief(base: Brief, extra: Partial<Brief>): Brief {
  const out = { ...base };
  if (!out.categories.length && extra.categories) out.categories = extra.categories;
  if (!out.games.length && extra.games) out.games = extra.games;
  if (!out.platforms.length && extra.platforms) out.platforms = extra.platforms;
  if (!out.countries.length && extra.countries) out.countries = extra.countries;
  if (!out.formats.length && extra.formats) out.formats = extra.formats;
  if (out.maxBudgetUsd === null && extra.maxBudgetUsd != null) out.maxBudgetUsd = extra.maxBudgetUsd;
  if (out.minAvgViews === null && extra.minAvgViews != null) out.minAvgViews = extra.minAvgViews;
  return out;
}
