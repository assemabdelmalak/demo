import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@radd/ui';

/** Unknown routes in the console's language, not Next's built-in English page. */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-title font-semibold">{t('title')}</h1>
      <p className="text-muted">{t('body')}</p>
      <Button asChild className="self-start">
        <Link href="/">{t('home')}</Link>
      </Button>
    </main>
  );
}
