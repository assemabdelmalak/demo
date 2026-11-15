'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@radd/ui';

/**
 * A page or layout failed on the server, usually because the API could not be reached. The
 * visitor gets a translated way to retry instead of Next's built-in English error.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('error');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-title font-semibold">{t('title')}</h1>
      <p className="text-muted">{t('body')}</p>
      <Button className="self-start" onClick={reset}>
        {t('retry')}
      </Button>
    </main>
  );
}
