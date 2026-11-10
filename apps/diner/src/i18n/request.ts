import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import {
  LOCALE_COOKIE,
  type Messages,
  resolveUiLocale,
  withFallbackMessages,
} from '@radd/shared/i18n';

import en from '../../messages/en.json';

/**
 * ADR-009: the language switch cookie, else English. Restaurant pages (P3) will pass the
 * restaurant's default locale as the second input. Accept-Language is deliberately ignored.
 */
export default getRequestConfig(async () => {
  const locale = resolveUiLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  const localized = (await import(`../../messages/${locale}.json`)) as { default: Messages };
  return { locale, messages: withFallbackMessages(en, localized.default) };
});
