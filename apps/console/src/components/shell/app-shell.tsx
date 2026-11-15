import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { UserMenu } from './user-menu';

import { LanguageSwitch } from '@/components/language-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { NAV_ITEMS, type Shell } from '@/lib/navigation';
import { type ShellContext } from '@/lib/session.server';
import { parseConsoleTheme, THEME_COOKIE } from '@/lib/theme';

/**
 * The signed-in frame shared by every role (ADR-030): a header with the organisation, the
 * language switch, the theme toggle and the account menu, and the shell's navigation, which is
 * a column on the start side from `md` and a sheet behind the menu button below it.
 */
export async function AppShell({
  shell,
  context,
  children,
}: {
  shell: Shell;
  context: ShellContext;
  children: ReactNode;
}) {
  const t = await getTranslations();
  const theme = parseConsoleTheme((await cookies()).get(THEME_COOKIE)?.value);
  const links = NAV_ITEMS[shell].map((item) => ({ href: item.href, label: t(`nav.${item.key}`) }));
  const { me, membership } = context;
  const heading = shell === 'admin' ? t('shell.admin') : (membership?.name ?? t('brand'));

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-3"
      >
        {t('shell.skipToContent')}
      </a>
      <header className="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
        <MobileNav
          links={links}
          navLabel={t('shell.navLabel')}
          openLabel={t('shell.openMenu')}
          title={heading}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-body font-semibold">{heading}</p>
          {membership && shell !== 'admin' ? (
            <p className="truncate text-caption text-muted">{t(`roleBadge.${membership.role}`)}</p>
          ) : null}
        </div>
        <LanguageSwitch />
        <ThemeToggle initial={theme} compact />
        <UserMenu name={me.user.name} email={me.user.email} />
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-e border-border p-3 md:block">
          <NavLinks links={links} label={t('shell.navLabel')} />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
