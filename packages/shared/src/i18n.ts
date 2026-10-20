/** Content languages a restaurant can enable (DATA_MODEL `locale` enum). */
export const LOCALES = ['en', 'ar', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Languages the UI is translated into today; French UI comes later (PRD §7). */
export const UI_LOCALES = ['en', 'ar'] as const satisfies readonly Locale[];
export type UiLocale = (typeof UI_LOCALES)[number];

/** ADR-009: English is the default and is shown first. */
export const DEFAULT_LOCALE: UiLocale = 'en';

/** Set by the language switch; the only per-visitor input to locale resolution. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export interface LocaleInputs {
  /** Value of the `NEXT_LOCALE` cookie, if any. */
  cookie?: string | undefined;
  /** The restaurant's `default_locale`, on diner pages that belong to a restaurant. */
  restaurantDefault?: string | undefined;
  /** UI locales the restaurant enabled; defaults to every UI locale. */
  enabled?: readonly string[] | undefined;
}

/**
 * ADR-009 "always English first": the visitor's explicit choice, then the restaurant's default,
 * then English. `Accept-Language` is deliberately not an input.
 */
export function resolveUiLocale({
  cookie,
  restaurantDefault,
  enabled,
}: LocaleInputs = {}): UiLocale {
  const allowed = (candidate: string | undefined): candidate is UiLocale =>
    isUiLocale(candidate) && (enabled === undefined || enabled.includes(candidate));
  if (allowed(cookie)) return cookie;
  if (allowed(restaurantDefault)) return restaurantDefault;
  return DEFAULT_LOCALE;
}

export type Messages = { [key: string]: string | Messages };

/**
 * Locale messages over the English reference catalogue, so a key missing from `ar` (or the `fr`
 * stub) shows English at runtime instead of a raw key (ADR-009). CI still fails on missing keys.
 */
export function withFallbackMessages(reference: Messages, localized: Messages): Messages {
  const merged: Messages = { ...reference };
  for (const [key, value] of Object.entries(localized)) {
    const base = merged[key];
    merged[key] =
      typeof value === 'object' && typeof base === 'object'
        ? withFallbackMessages(base, value)
        : value;
  }
  return merged;
}
