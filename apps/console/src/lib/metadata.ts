import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/** "Sign in · Radd Menu": every page gets its own translated title (WCAG 2.4.2). */
export async function pageMetadata(titleKey: string): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('meta.pageTitle', { page: t(titleKey) }) };
}
