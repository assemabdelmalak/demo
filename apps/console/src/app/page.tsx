import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import { Button, Chip, Tabs, TabsContent, TabsList, TabsTrigger } from '@radd/ui';

import { LanguageSwitch } from '@/components/language-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { parseConsoleTheme, THEME_COOKIE } from '@/lib/theme';

/** P0 placeholder home: proves locale, direction, fonts and light/dark tokens end to end. */
export default async function ConsoleHomePage() {
  const t = await getTranslations('home');
  const theme = parseConsoleTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-title font-semibold">{t('title')}</h1>
          <p className="text-small text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle initial={theme} />
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <Tabs defaultValue="menu">
          <TabsList aria-label={t('sectionsLabel')}>
            <TabsTrigger value="menu">{t('tabs.menu')}</TabsTrigger>
            <TabsTrigger value="live">{t('tabs.live')}</TabsTrigger>
            <TabsTrigger value="insights">{t('tabs.insights')}</TabsTrigger>
          </TabsList>
          <TabsContent value="menu" className="flex flex-col gap-4">
            <p className="text-muted-foreground">{t('placeholder')}</p>
            <div className="flex flex-wrap gap-2">
              <Chip selected>{t('chips.vegan')}</Chip>
              <Chip>{t('chips.spicy')}</Chip>
            </div>
            <Button className="self-start">{t('cta')}</Button>
          </TabsContent>
          <TabsContent value="live">
            <p className="text-muted-foreground">{t('placeholder')}</p>
          </TabsContent>
          <TabsContent value="insights">
            <p className="text-muted-foreground">{t('placeholder')}</p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
