import { getTranslations } from 'next-intl/server';

import { type NavKey } from '@/lib/navigation';

/** An empty page for a section that a later phase builds (Demo checkpoint P1: empty shells). */
export async function PlaceholderPage({ section }: { section: NavKey }) {
  const t = await getTranslations();
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h1 className="text-title font-semibold">{t(`nav.${section}`)}</h1>
      <p className="text-body text-muted">{t('placeholder.body')}</p>
    </div>
  );
}
