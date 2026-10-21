import { getTranslations } from 'next-intl/server';

import { Button, Price, ThemeProvider } from '@radd/ui';

import { LanguageSwitch } from '@/components/language-switch';

/** P0 placeholder home: proves locale, direction, fonts and theme tokens end to end. */
export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <ThemeProvider className="min-h-dvh bg-surface text-ink">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-small text-muted">{t('eyebrow')}</span>
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-10 pt-8">
        <h1 className="text-display font-semibold">{t('title')}</h1>
        <p className="text-body text-muted">{t('tagline')}</p>
        <section
          aria-labelledby="sample-dish"
          className="flex items-center justify-between border-y border-line py-4"
        >
          <div>
            <h2 id="sample-dish" className="text-dish font-semibold">
              {t('sampleDish')}
            </h2>
            <p className="text-small text-muted">{t('sampleDescription')}</p>
          </div>
          <Price primary="$6.50" secondary={t('sampleSecondary')} />
        </section>
        <Button className="w-full">{t('cta')}</Button>
      </main>
    </ThemeProvider>
  );
}
