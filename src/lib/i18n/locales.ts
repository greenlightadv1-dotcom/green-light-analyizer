export type LocaleCode = "en" | "ar" | "fr" | "es" | "de";

export type LocaleDef = {
  code: LocaleCode;
  /** English name, for places that stay in English regardless of locale (e.g. this list itself). */
  name: string;
  /** The language's own name for itself, shown in the switcher. */
  nativeName: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: LocaleDef[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isLocaleCode(value: string): value is LocaleCode {
  return LOCALES.some((l) => l.code === value);
}

export function dirFor(locale: LocaleCode): "ltr" | "rtl" {
  return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}
