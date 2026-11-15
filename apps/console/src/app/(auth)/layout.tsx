import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { LanguageSwitch } from '@/components/language-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { parseConsoleTheme, THEME_COOKIE } from '@/lib/theme';

/**
 * Account pages share one calm, centred column (ADR-030). The language switch and theme toggle
 * stay at the top end of every page, before the form in the tab order.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const theme = parseConsoleTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-body font-semibold">{t('brand')}</p>
        <div className="flex items-center gap-2">
          <ThemeToggle initial={theme} />
          <LanguageSwitch />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pt-4 pb-12 sm:items-start sm:pt-12">
        <div className="flex w-full max-w-md flex-col gap-6 text-body sm:rounded-sheet sm:border sm:border-border sm:bg-card sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
