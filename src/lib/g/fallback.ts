import type { Role } from "../types/database.ts";
import { allowedProposals, type CollabSummary, type GProposal, type NextStep, type ProposalScope } from "./collab.ts";
import type { GLocale, Intent } from "./conversation.ts";

/**
 * G's prepared actions when the AI engine cannot answer (no NVIDIA key, rate
 * limit, outage, or a rejected reply). Pure — tested in fallback.test.ts.
 *
 * Every proposal is built only from the caller's own context: a published
 * brief they own and a creator the directory recommended (company), a
 * collaboration they are party to (either side), or an official headline
 * already stored for their tags (creator). The wording is a fixed template in
 * the person's language; no figure appears that is not in the data, because
 * the only values interpolated are titles, names, a source and a date. The
 * result still passes through `allowedProposals`, so the same scope checks
 * and masking apply as for a model's proposal. Nothing is executed: the
 * person edits, presses the button and confirms, exactly as before.
 */

export type FallbackInput = {
  role: Role;
  locale: GLocale;
  intents: readonly Intent[];
  scope: ProposalScope;
  /** Company: its briefs (only published ones can carry an invitation). */
  briefs?: readonly { id: string; title: string; status: string }[];
  /** Company: directory recommendations, best first. */
  recommendations?: readonly { creator_id: string; full_name: string }[];
  collaborations?: readonly Pick<CollabSummary, "id" | "title" | "next">[];
  /** Creator: stored official headlines for their tags. */
  news?: readonly { title: string; url: string; published_at: string; source: string }[];
  /** Company: the brief as understood from the form and the message, and the message itself. */
  brief?: {
    categories: readonly string[];
    platforms: readonly string[];
    countries: readonly string[];
    maxBudgetUsd: number | null;
  };
  message?: string;
};

type Templates = {
  briefTitle: string;
  invite: (name: string, brief: string) => string;
  checkIn: (title: string) => string;
  ideaBody: (headline: string, source: string, date: string, url: string) => string;
};

const T: Record<GLocale, Templates> = {
  en: {
    briefTitle: "Campaign brief (draft from G)",
    invite: (n, b) => `Hi ${n}, we think you'd be a great fit for our brief "${b}". The scope, timeline and budget are in the brief. Would you like to take a look?`,
    checkIn: (t) => `Hi, checking in on "${t}". Is there anything you need from me to move this forward?`,
    ideaBody: (h, s, d, u) => `Based on an official update: ${h}\nSource: ${s}, ${d}\n${u}\n\nAngle: explain what changed and what it means for your audience.`,
  },
  ar: {
    briefTitle: "موجز حملة (مسودة من G)",
    invite: (n, b) => `مرحبًا ${n}، نرى أنك مناسب جدًا لموجز حملتنا "${b}". النطاق والجدول الزمني والميزانية مذكورة في الموجز. هل تود الاطلاع عليه؟`,
    checkIn: (t) => `مرحبًا، أتابع بخصوص "${t}". هل تحتاج إلى أي شيء مني للمضي قدمًا؟`,
    ideaBody: (h, s, d, u) => `مستوحاة من تحديث رسمي: ${h}\nالمصدر: ${s}، ${d}\n${u}\n\nالزاوية: اشرح ما الذي تغيّر وما يعنيه لجمهورك.`,
  },
  fr: {
    briefTitle: "Brief de campagne (brouillon de G)",
    invite: (n, b) => `Bonjour ${n}, nous pensons que vous correspondez très bien à notre brief « ${b} ». Le périmètre, le calendrier et le budget figurent dans le brief. Souhaitez-vous y jeter un œil ?`,
    checkIn: (t) => `Bonjour, je fais le point sur « ${t} ». Avez-vous besoin de quelque chose de ma part pour avancer ?`,
    ideaBody: (h, s, d, u) => `D'après une annonce officielle : ${h}\nSource : ${s}, ${d}\n${u}\n\nAngle : expliquez ce qui a changé et ce que cela signifie pour votre audience.`,
  },
  es: {
    briefTitle: "Brief de campaña (borrador de G)",
    invite: (n, b) => `Hola ${n}, creemos que encajas muy bien con nuestro brief "${b}". El alcance, los plazos y el presupuesto están en el brief. ¿Te gustaría verlo?`,
    checkIn: (t) => `Hola, hago seguimiento de "${t}". ¿Necesitas algo de mi parte para avanzar?`,
    ideaBody: (h, s, d, u) => `Basado en una actualización oficial: ${h}\nFuente: ${s}, ${d}\n${u}\n\nEnfoque: explica qué cambió y qué significa para tu audiencia.`,
  },
  de: {
    briefTitle: "Kampagnen-Briefing (Entwurf von G)",
    invite: (n, b) => `Hallo ${n}, wir glauben, dass du sehr gut zu unserem Briefing „${b}“ passt. Umfang, Zeitplan und Budget stehen im Briefing. Möchtest du es dir ansehen?`,
    checkIn: (t) => `Hallo, ich melde mich wegen „${t}“. Brauchst du noch etwas von mir, um weiterzumachen?`,
    ideaBody: (h, s, d, u) => `Basierend auf einer offiziellen Meldung: ${h}\nQuelle: ${s}, ${d}\n${u}\n\nAnsatz: Erkläre, was sich geändert hat und was das für dein Publikum bedeutet.`,
  },
};

/** Steps where the other party is the one to act, so a polite check-in fits. */
const WAITING: readonly NextStep[] = ["wait_for_other_side", "wait_for_review", "wait_for_submission"];

export function fallbackProposals(input: FallbackInput): GProposal[] {
  const { role, intents, scope } = input;
  if (role === "admin") return [];
  const tpl = T[input.locale] ?? T.en;
  const candidates: Record<string, unknown>[] = [];

  if (role === "company" && intents.some((i) => i === "recommend" || i === "brief" || i === "help")) {
    const brief = (input.briefs ?? []).find((b) => b.status === "published" && scope.publishedBriefIds.has(b.id));
    if (brief) {
      const pick = (input.recommendations ?? []).find(
        (r) => scope.creatorIds.has(r.creator_id) && !scope.invited.has(`${brief.id}:${r.creator_id}`),
      );
      if (pick) {
        candidates.push({
          type: "invitation",
          brief_id: brief.id,
          creator_id: pick.creator_id,
          message: tpl.invite(pick.full_name.split(" ")[0] || pick.full_name, brief.title),
        });
      }
    }
  }

  // A company describing a campaign: a draft brief built from its own words and
  // the criteria understood from them. The description is the message itself;
  // nothing is added that the company did not say.
  if (role === "company" && intents.includes("brief") && input.brief && (input.message ?? "").trim().length >= 10) {
    const b = input.brief;
    if (b.categories.length || b.platforms.length || b.countries.length || b.maxBudgetUsd !== null) {
      candidates.push({
        type: "brief_draft",
        title: tpl.briefTitle,
        description: (input.message ?? "").trim(),
        platforms: [...b.platforms],
        categories: [...b.categories],
        target_countries: [...b.countries],
        budget_min_usd: null,
        budget_max_usd: b.maxBudgetUsd,
      });
    }
  }

  if (role === "creator" && intents.includes("content")) {
    const item = (input.news ?? [])[0];
    if (item && item.title.trim()) {
      candidates.push({
        type: "content_draft",
        kind: "idea",
        title: item.title.slice(0, 160),
        body: tpl.ideaBody(item.title, item.source, item.published_at.slice(0, 10), item.url),
      });
    }
  }

  if (intents.includes("collab")) {
    const waiting = (input.collaborations ?? []).find((c) => WAITING.includes(c.next) && c.title.trim());
    if (waiting) candidates.push({ type: "message_draft", collaboration_id: waiting.id, text: tpl.checkIn(waiting.title) });
  }

  return allowedProposals(candidates, scope);
}
