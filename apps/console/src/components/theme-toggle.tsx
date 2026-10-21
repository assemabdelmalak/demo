'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@radd/ui';

import { type ConsoleTheme, THEME_COOKIE } from '@/lib/theme';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function applyTheme(theme: ConsoleTheme): void {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${String(ONE_YEAR_SECONDS)}; samesite=lax`;
}

/**
 * Switches the console between the light and dark token sets (ADR-018). The server reads the same
 * cookie to render the right theme on first paint, so there is no flash.
 */
export function ThemeToggle({ initial }: { initial: ConsoleTheme }) {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState<ConsoleTheme>(initial);
  const next: ConsoleTheme = theme === 'dark' ? 'light' : 'dark';

  function toggle() {
    applyTheme(next);
    setTheme(next);
  }

  return (
    // A toggle keeps one label; aria-pressed carries the state, so "Dark mode, pressed" means on.
    <Button variant="secondary" size="sm" aria-pressed={theme === 'dark'} onClick={toggle}>
      {t('darkMode')}
    </Button>
  );
}
