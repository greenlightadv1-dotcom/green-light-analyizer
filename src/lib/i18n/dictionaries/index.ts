import type { LocaleCode } from "@/lib/i18n/locales";
import en from "./en";
import ar from "./ar";
import fr from "./fr";
import es from "./es";
import de from "./de";
import type { Dictionary } from "./en";

export const dictionaries: Record<LocaleCode, Dictionary> = { en, ar, fr, es, de };
export type { Dictionary };
