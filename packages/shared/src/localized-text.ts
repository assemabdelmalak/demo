import { z } from 'zod';

import { type Locale, LOCALES } from './i18n.js';

/** Owner-written content in up to three languages (DATA_MODEL §0), stored as JSONB. */
export type LocalizedText = Partial<Record<Locale, string>>;

/**
 * At least one language, each value trimmed and 1..`maxLength` characters. Unknown keys are
 * rejected, so a typo such as `eng` cannot silently drop a translation.
 */
export function localizedTextSchema(maxLength = 200) {
  const text = z.string().trim().min(1).max(maxLength);
  return z
    .strictObject(Object.fromEntries(LOCALES.map((locale) => [locale, text.optional()])))
    .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
      message: 'At least one language is required',
    }) as z.ZodType<LocalizedText>;
}
