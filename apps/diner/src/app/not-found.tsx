import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@radd/ui';

/** Unknown links (a mistyped or retired QR code) in the diner's language, not Next's English page. */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-title font-semibold">{t('title')}</h1>
      <p className="text-body text-muted">{t('body')}</p>
      <Button asChild className="self-start">
        <Link href="/">{t('home')}</Link>
      </Button>
    </main>
  );
}
