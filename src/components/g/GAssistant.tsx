"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { G_EVENT, type GEventDetail } from "@/components/g/events";
import { AssessmentCard, BriefCard, ComparisonCard, DealsCard, RecommendationsCard } from "@/components/g/GCards";
import { useGState, type GMessage } from "@/components/g/store";
import { useVoice } from "@/components/g/useVoice";
import { useWakeWord, type WakeStatus } from "@/components/g/useWakeWord";
import { WAKE_PHRASES } from "@/lib/g/wake";
import { actionHref } from "@/lib/g/actions";
import type { CreatorAssessment, DealSummary } from "@/lib/g/assessment";
import type { Brief, ComparisonRow, Recommendation } from "@/lib/g/recommend";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import { CONTENT_CATEGORIES, GAME_IDS, gameTitle } from "@/lib/taxonomy";
import type { Role } from "@/lib/types/database";

export type GMarkState = "idle" | "wake" | "listening" | "thinking" | "speaking";

/**
 * G's mark: the brand "G" in a green disc, the same everywhere G appears. Its
 * state is shown by motion around the disc (a wake burst, listening rings, a
 * thinking arc, speaking bars), never by changing the mark itself, so G stays
 * recognisable. Reduced-motion users get the static mark (globals.css).
 */
export function GMark({ size = 36, state = "idle" }: { size?: number; state?: GMarkState }) {
  return (
    <span aria-hidden className="relative inline-flex shrink-0" style={{ width: size, height: size }} data-g-state={state}>
      {state === "listening" ? (
        <>
          <span className="g-ring absolute inset-0 rounded-full border-2 border-brand-green" />
          <span className="g-ring absolute inset-0 rounded-full border-2 border-brand-green" style={{ animationDelay: "0.7s" }} />
        </>
      ) : null}
      {state === "thinking" ? (
        <span className="g-spin absolute -inset-1 rounded-full border-2 border-transparent border-t-brand-green border-e-brand-green/50" />
      ) : null}
      <span
        className={`relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-brand-green to-emerald-500 font-bold text-ink shadow-[0_0_18px_rgba(98,232,35,0.45)] ${state === "wake" ? "g-wake" : ""}`}
      >
        <span style={{ fontSize: size * 0.5 }}>G</span>
      </span>
      {state === "speaking" ? (
        <span className="absolute -bottom-0.5 -end-1 flex h-3 items-end gap-[2px] rounded-full bg-white/90 px-0.5 dark:bg-navy-dark/90">
          {[0, 0.15, 0.3].map((d) => (
            <span key={d} className="g-bar block h-full w-[2px] rounded bg-brand-green" style={{ animationDelay: `${d}s` }} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** A short two-note chime: G's audible "yes?". WebAudio, no asset, ~0.25s. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(ctx.destination);
    [660, 990].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.1);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio blocked: the visual cue still shows */
  }
}

const SUGGESTIONS: Record<Role, string[]> = {
  creator: ["g.suggest.creator1", "g.suggest.creator2", "g.suggest.creator3"],
  company: ["g.suggest.company1", "g.suggest.company2", "g.suggest.company3"],
  admin: ["g.suggest.admin1"],
};

const newId = () => Math.random().toString(36).slice(2, 10);
const CHIP = "rounded-full border px-2.5 py-1 text-[11px] transition";
const chipClass = (on: boolean) =>
  `${CHIP} ${on ? "border-brand-green/40 bg-brand-green/15 text-brand-green" : "border-fg/10 bg-fg/5 text-fg/60 hover:text-fg"}`;

/**
 * G — the site-wide assistant (feature 7), mounted once in the app shell so it
 * is on every authenticated page and its conversation survives navigation.
 * Closed by default; it never opens itself over a form. The same identity for
 * creators and companies; what it can see and suggest is decided by the
 * server from the session (app/api/g/route.ts).
 */
export function GAssistant({ userId, role, demo = false, basePath = "" }: { userId: string; role: Role; demo?: boolean; basePath?: string }) {
  const { t, locale } = useTranslation();
  const pathname = usePathname() ?? "/";
  const page = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const [state, update] = useGState(`gl:g:v1:${userId}:${role}`);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [voiceNoticeSeen, setVoiceNoticeSeen] = useState(false);
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    async (text: string): Promise<string | null> => {
      const message = text.trim();
      if (!message || busy) return null;
      setDraft("");
      const history = state.messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      update((s) => ({ ...s, messages: [...s.messages, { id: newId(), role: "user", text: message }] }));
      if (demo) {
        update((s) => ({ ...s, messages: [...s.messages, { id: newId(), role: "assistant", text: t("g.previewNotice"), engine: "rules" }] }));
        // Spoken too, so the preview exercises the whole voice loop.
        return t("g.previewNotice");
      }
      setBusy(true);
      try {
        const res = await fetch("/api/g", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            history,
            locale,
            page,
            brief: role === "company" ? state.brief : null,
            compare: role === "company" ? state.compare.map((c) => c.id) : [],
          }),
        });
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) throw new Error("session");
        const data = (await res.json()) as {
          error?: string;
          engine?: "ai" | "rules";
          reply?: string | null;
          cards?: Record<string, unknown>;
          actions?: GMessage["actions"];
        };
        if (!res.ok) {
          const code = res.status === 429 ? "rateLimited" : res.status === 401 || res.status === 403 ? "session" : "failed";
          update((s) => ({ ...s, messages: [...s.messages, { id: newId(), role: "assistant", text: "", error: code }] }));
          return null;
        }
        const reply = data.reply ?? null;
        update((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              id: newId(),
              role: "assistant",
              text: reply ?? "",
              engine: data.engine,
              cards: data.cards,
              actions: data.actions ?? [],
            },
          ],
        }));
        return reply ?? t("g.spokenFallback");
      } catch (e) {
        const code = e instanceof Error && e.message === "session" ? "session" : "network";
        update((s) => ({ ...s, messages: [...s.messages, { id: newId(), role: "assistant", text: "", error: code }] }));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, demo, locale, page, role, state.brief, state.compare, state.messages, t, update],
  );

  const voiceSendRef = useRef<(text: string) => void>(() => {});
  const voice = useVoice(locale, (text) => voiceSendRef.current(text));
  useEffect(() => {
    voiceSendRef.current = (text: string) => {
      void send(text).then((spoken) => voice.replied(state.speakReplies ? spoken : null));
    };
  });

  // "Hey G" (opt-in). The listener steps aside while G has its own voice turn
  // or is answering, so only one recognizer ever holds the microphone.
  const [wokeAt, setWokeAt] = useState<number | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  });
  const wake = useWakeWord({
    userId,
    locale,
    busy: busy || (voice.phase !== "idle" && voice.phase !== "error"),
    onWake: (question) => {
      update((s) => ({ ...s, open: true }));
      setWokeAt(Date.now());
      if (state.speakReplies) chime();
      // The wake phrase itself is never sent. A question said in the same
      // breath goes straight to G; otherwise G listens for the next sentence.
      if (question) voiceRef.current.ask(question);
      else setTimeout(() => voiceRef.current.start(), 350);
    },
  });
  useEffect(() => {
    if (wokeAt === null) return;
    const id = setTimeout(() => setWokeAt(null), 1800);
    return () => clearTimeout(id);
  }, [wokeAt]);
  const markState: GMarkState = wokeAt
    ? "wake"
    : voice.phase === "listening"
      ? "listening"
      : busy || voice.phase === "processing"
        ? "thinking"
        : voice.phase === "speaking"
          ? "speaking"
          : "idle";

  // Hand-offs from the rest of the app (Discovery, Analyzer): open, pre-fill
  // a question, or add a creator to the comparison. Never sends by itself.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<GEventDetail>).detail;
      if (!detail) return;
      if (detail.type === "ask") {
        setDraft(detail.text);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      update((s) => {
        let compare = s.compare;
        if (detail.type === "compare" && role === "company" && !compare.some((c) => c.id === detail.creatorId)) {
          compare = [...compare, { id: detail.creatorId, name: detail.name }].slice(-4);
        }
        return { ...s, open: true, compare };
      });
    };
    window.addEventListener(G_EVENT, onEvent);
    return () => window.removeEventListener(G_EVENT, onEvent);
  }, [role, update]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [state.messages.length, state.open]);

  const close = () => {
    voice.stop();
    update((s) => ({ ...s, open: false }));
  };

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const brief = state.brief as Partial<Brief>;
  const setBrief = (patch: Partial<Brief>) => update((s) => ({ ...s, brief: { ...s.brief, ...patch } }));
  const toggleIn = <T extends string>(list: T[] | undefined, v: T) =>
    (list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v];

  if (!state.open) {
    return (
      <div className="fixed end-4 bottom-4 z-40 flex flex-col items-end gap-2 sm:end-6 sm:bottom-6">
        <WakeIndicator status={wake.status} enabled={wake.enabled} onOff={wake.disable} onResume={() => void wake.enable()} />
        <button
          type="button"
          onClick={() => update((s) => ({ ...s, open: true }))}
          aria-label={t("g.open")}
          className="flex items-center gap-2 rounded-full border border-brand-green/30 bg-white/90 py-1.5 ps-1.5 pe-4 text-sm font-semibold text-fg shadow-xl backdrop-blur transition hover:-translate-y-0.5 dark:bg-navy-dark/90"
        >
          <GMark size={34} state={markState} />
          <span>{t("g.askG")}</span>
        </button>
      </div>
    );
  }

  const listening = voice.phase === "listening";
  const speaking = voice.phase === "speaking";

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="g-panel-in fixed inset-x-0 bottom-0 z-40 flex h-[88dvh] flex-col rounded-t-2xl border border-fg/10 bg-white shadow-2xl dark:bg-navy-dark sm:inset-x-auto sm:end-6 sm:bottom-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[420px] sm:rounded-2xl"
    >
      <header className="flex items-center gap-3 border-b border-fg/10 px-4 py-3">
        <GMark state={markState} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-sm font-semibold text-fg">
            G
          </h2>
          <p className="truncate text-[11px] text-fg/50">{t(`g.subtitle.${role}`)}</p>
        </div>
        {voice.canSpeak ? (
          <button
            type="button"
            onClick={() => {
              // Turning replies off while G talks stops that speech now; the
              // setting itself lives in speakReplies only, so turning it back
              // on always works (a second, reducer-side mute flag used to
              // stay set and silence every later answer).
              if (speaking) voice.stop();
              update((s) => ({ ...s, speakReplies: !s.speakReplies }));
            }}
            aria-pressed={state.speakReplies}
            className="rounded-lg px-2 py-1 text-[11px] text-fg/60 hover:bg-fg/5 hover:text-fg"
          >
            {state.speakReplies ? t("g.voice.repliesOn") : t("g.voice.repliesOff")}
          </button>
        ) : null}
        <button type="button" onClick={close} aria-label={t("g.close")} className="rounded-lg p-1.5 text-fg/60 hover:bg-fg/5 hover:text-fg">
          ✕
        </button>
      </header>

      <WakeSettings
        wake={wake}
        consentOpen={consentOpen}
        setConsentOpen={setConsentOpen}
      />

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {state.messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-fg/75">{t(`g.welcome.${role}`)}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS[role].map((k) => (
                <button key={k} type="button" onClick={() => void send(t(k))} className={chipClass(false)}>
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {state.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ms-8 rounded-2xl rounded-ee-sm bg-brand-green/15 px-3 py-2 text-sm whitespace-pre-wrap text-fg">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="me-4 space-y-2">
              {m.error ? (
                <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                  {t(`g.error.${m.error}`)}
                </p>
              ) : (
                <>
                  {m.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{m.text}</p> : null}
                  {m.engine === "rules" && !demo ? <p className="text-[11px] text-fg/45">{t("g.rulesNotice")}</p> : null}
                  {m.engine === "ai" ? <p className="text-[10px] text-fg/35">{t("g.aiNotice")}</p> : null}
                  {m.cards?.assessment ? <AssessmentCard a={m.cards.assessment as CreatorAssessment} /> : null}
                  {m.cards?.brief ? <BriefCard {...(m.cards.brief as { value: Brief; missing: string[] })} brief={(m.cards.brief as { value: Brief }).value} /> : null}
                  {m.cards?.recommendations ? (
                    <RecommendationsCard
                      rec={m.cards.recommendations as { directorySize: number; items: Recommendation[] }}
                      onCompare={(id, name) =>
                        update((s) => (s.compare.some((c) => c.id === id) ? s : { ...s, compare: [...s.compare, { id, name }].slice(-4) }))
                      }
                    />
                  ) : null}
                  {m.cards?.comparison ? (
                    <ComparisonCard cmp={m.cards.comparison as { creators: { creator_id: string; full_name: string }[]; rows: ComparisonRow[] }} />
                  ) : null}
                  {m.cards?.deals ? <DealsCard deals={m.cards.deals as { summary?: CreatorAssessment["deals"]; recent: DealSummary[] }} /> : null}
                  {m.actions?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <Link
                          key={`${a.action}-${a.param ?? ""}`}
                          href={`${basePath}${actionHref(a)}`}
                          className="rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1 text-[11px] font-medium text-brand-green hover:bg-brand-green/20"
                        >
                          {t(`g.action.${a.action}`)} →
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ),
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-xs text-fg/50">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-green" aria-hidden />
            {t("g.thinking")}
          </p>
        ) : null}
      </div>

      {role === "company" ? (
        <div className="border-t border-fg/10 px-4 py-2">
          {state.compare.length ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-fg/50">{t("g.compareTray")}</span>
              {state.compare.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update((s) => ({ ...s, compare: s.compare.filter((x) => x.id !== c.id) }))}
                  className={chipClass(true)}
                  aria-label={t("g.removeFromCompare", { name: c.name })}
                >
                  {c.name} ✕
                </button>
              ))}
              {state.compare.length >= 2 ? (
                <button type="button" onClick={() => void send(t("g.compareMessage"))} className="text-[11px] font-medium text-brand-green underline underline-offset-4">
                  {t("g.compareNow")}
                </button>
              ) : null}
            </div>
          ) : null}
          <button type="button" onClick={() => setShowBrief((v) => !v)} className="text-[11px] font-medium text-fg/60 underline underline-offset-4 hover:text-fg" aria-expanded={showBrief}>
            {showBrief ? t("g.brief.hide") : t("g.brief.edit")}
          </button>
          {showBrief ? (
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pe-1">
              <input
                value={brief.objective ?? ""}
                onChange={(e) => setBrief({ objective: e.target.value })}
                placeholder={t("g.brief.objective")}
                aria-label={t("g.brief.objective")}
                maxLength={300}
                className="h-9 w-full rounded-lg border border-fg/10 bg-fg/5 px-2.5 text-xs text-fg"
              />
              <div className="flex flex-wrap gap-1.5" aria-label={t("g.brief.categories")}>
                {CONTENT_CATEGORIES.filter((c) => c !== "other").map((c) => (
                  <button key={c} type="button" aria-pressed={(brief.categories ?? []).includes(c)} onClick={() => setBrief({ categories: toggleIn(brief.categories, c) })} className={chipClass((brief.categories ?? []).includes(c))}>
                    {t(`taxonomy.category.${c}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label={t("g.brief.games")}>
                {GAME_IDS.map((g) => (
                  <button key={g} type="button" aria-pressed={(brief.games ?? []).includes(g)} onClick={() => setBrief({ games: toggleIn(brief.games, g) })} className={chipClass((brief.games ?? []).includes(g))}>
                    {gameTitle(g)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label={t("g.brief.platforms")}>
                {PLATFORMS.map((p) => (
                  <button key={p} type="button" aria-pressed={(brief.platforms ?? []).includes(p)} onClick={() => setBrief({ platforms: toggleIn(brief.platforms, p) })} className={chipClass((brief.platforms ?? []).includes(p))}>
                    {PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={(brief.countries ?? []).join(", ")}
                  onChange={(e) => setBrief({ countries: e.target.value.split(/[\s,]+/).filter(Boolean).map((c) => c.toUpperCase()).slice(0, 10) })}
                  placeholder={t("g.brief.countries")}
                  aria-label={t("g.brief.countries")}
                  dir="ltr"
                  className="h-9 rounded-lg border border-fg/10 bg-fg/5 px-2.5 text-xs text-fg"
                />
                <input
                  type="number"
                  min={0}
                  value={brief.maxBudgetUsd ?? ""}
                  onChange={(e) => setBrief({ maxBudgetUsd: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder={t("g.brief.budget")}
                  aria-label={t("g.brief.budget")}
                  dir="ltr"
                  className="h-9 rounded-lg border border-fg/10 bg-fg/5 px-2.5 text-xs text-fg"
                />
                <input
                  type="number"
                  min={0}
                  value={brief.minAvgViews ?? ""}
                  onChange={(e) => setBrief({ minAvgViews: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder={t("g.brief.minViews")}
                  aria-label={t("g.brief.minViews")}
                  dir="ltr"
                  className="h-9 rounded-lg border border-fg/10 bg-fg/5 px-2.5 text-xs text-fg"
                />
                <input
                  value={brief.timeline ?? ""}
                  onChange={(e) => setBrief({ timeline: e.target.value })}
                  placeholder={t("g.brief.timeline")}
                  aria-label={t("g.brief.timeline")}
                  maxLength={120}
                  className="h-9 rounded-lg border border-fg/10 bg-fg/5 px-2.5 text-xs text-fg"
                />
              </div>
              <button type="button" onClick={() => void send(t("g.brief.findMessage"))} className="text-[11px] font-semibold text-brand-green underline underline-offset-4">
                {t("g.brief.find")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        className="border-t border-fg/10 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        {wokeAt || listening || speaking || voice.phase === "processing" || voice.error ? (
          <p className="mb-2 text-[11px] text-fg/55" role="status">
            {wokeAt && !voice.error && voice.phase !== "processing" ? `${t("g.wake.greeting")} ` : ""}
            {voice.error ? t(`g.voice.error.${voice.error}`) : t(`g.voice.${voice.phase}`)}
          </p>
        ) : null}
        {voice.canListen && !voiceNoticeSeen ? (
          <p className="mb-2 text-[10px] leading-relaxed text-fg/40">{t("g.voice.privacy")}</p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={t("g.placeholder")}
            aria-label={t("g.placeholder")}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-fg/10 bg-fg/5 px-3 py-2 text-sm text-fg placeholder:text-fg/35 focus:border-brand-green/50 focus:outline-none"
          />
          {listening || speaking ? (
            <button type="button" onClick={voice.stop} aria-label={t("g.voice.stop")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/40 bg-red-400/10 text-red-600 dark:text-red-300">
              ■
            </button>
          ) : null}
          {voice.canListen ? (
            listening ? null : (
              // While G speaks, the mic stays available: pressing it cuts G
              // off and listens (barge-in), next to the Stop button.
              <button
                type="button"
                onClick={() => {
                  setVoiceNoticeSeen(true);
                  voice.start();
                }}
                disabled={busy}
                aria-label={t("g.voice.start")}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-fg/10 bg-fg/5 text-fg/70 hover:text-fg disabled:opacity-50"
              >
                🎙
              </button>
            )
          ) : null}
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="h-11 rounded-xl bg-brand-green px-4 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {t("g.send")}
          </button>
        </div>
        {!voice.canListen ? <p className="mt-1.5 text-[10px] text-fg/40">{t("g.voice.unsupported")}</p> : null}
      </form>
    </section>
  );
}

type Wake = ReturnType<typeof useWakeWord>;

/**
 * The always-visible sign that "Hey G" is on, with an immediate off switch.
 * Shown beside the floating button and inside the panel whenever the opt-in
 * is active (or paused awaiting Resume). Nothing renders when it is off.
 */
function WakeIndicator({ status, enabled, onOff, onResume }: { status: WakeStatus; enabled: boolean; onOff: () => void; onResume: () => void }) {
  const { t } = useTranslation();
  if (status === "needs_resume") {
    return (
      <div className="flex items-center gap-2 rounded-full border border-fg/15 bg-white/95 px-3 py-1 text-[11px] text-fg/75 shadow dark:bg-navy-dark/95" role="status">
        <span aria-hidden>🎙</span>
        {t("g.wake.needsResume")}
        <button type="button" onClick={onResume} className="font-semibold text-brand-green underline underline-offset-2">
          {t("g.wake.resume")}
        </button>
      </div>
    );
  }
  if (!enabled) return null;
  const live = status === "listening";
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-red-400/40 bg-white/95 px-3 py-1 text-[11px] text-fg/80 shadow dark:bg-navy-dark/95"
      role="status"
      data-testid="g-wake-indicator"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "g-blink bg-red-500" : "bg-fg/30"}`} />
      <span aria-hidden>🎙</span>
      {live ? t("g.wake.listening") : status === "network" ? t("g.wake.error.network") : t("g.wake.paused")}
      <button type="button" onClick={onOff} className="font-semibold text-red-600 underline underline-offset-2 dark:text-red-300">
        {t("g.wake.turnOff")}
      </button>
    </div>
  );
}

/** The opt-in setting, its consent explanation, and every failure explained. */
function WakeSettings({
  wake,
  consentOpen,
  setConsentOpen,
}: {
  wake: Wake;
  consentOpen: boolean;
  setConsentOpen: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const phrases = Object.values(WAKE_PHRASES).join(" · ");
  return (
    <div className="border-b border-fg/10 px-4 py-2 text-[11px]">
      {wake.enabled || wake.status === "needs_resume" ? (
        <div className="space-y-1">
          <WakeIndicator status={wake.status} enabled={wake.enabled} onOff={wake.disable} onResume={() => void wake.enable()} />
          {wake.status === "network" ? (
            <button type="button" onClick={wake.retry} className="font-medium text-brand-green underline underline-offset-2">
              {t("g.wake.retry")}
            </button>
          ) : null}
        </div>
      ) : consentOpen ? (
        <div className="space-y-2 rounded-xl border border-fg/10 bg-fg/5 p-3" role="group" aria-labelledby="g-wake-consent-title">
          <p id="g-wake-consent-title" className="text-xs font-semibold text-fg">
            {t("g.wake.consentTitle")}
          </p>
          <ul className="list-disc space-y-1 ps-4 text-fg/70">
            <li>{t("g.wake.consentMic")}</li>
            <li>{t("g.wake.consentExternal")}</li>
            <li>{t("g.wake.consentNoStore")}</li>
            <li>{t("g.wake.consentDisable")}</li>
            <li>{t("g.wake.consentLimits")}</li>
          </ul>
          <p className="text-fg/55" dir="auto">
            {t("g.wake.phrases")}: {phrases}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConsentOpen(false);
                void wake.enable();
              }}
              className="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {t("g.wake.allow")}
            </button>
            <button type="button" onClick={() => setConsentOpen(false)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/70">
              {t("g.wake.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            disabled={!wake.supported}
            onClick={() => setConsentOpen(true)}
            className="font-medium text-fg/70 underline underline-offset-2 hover:text-fg disabled:no-underline disabled:opacity-60"
          >
            {t("g.wake.enable")}
          </button>
          {wake.status === "unsupported" ? <span className="text-fg/50">{t("g.wake.error.unsupported")}</span> : null}
          {wake.status === "denied" ? <span className="text-red-600 dark:text-red-300" role="alert">{t("g.wake.error.denied")}</span> : null}
          {wake.status === "unavailable" ? <span className="text-red-600 dark:text-red-300" role="alert">{t("g.wake.error.unavailable")}</span> : null}
        </div>
      )}
    </div>
  );
}
