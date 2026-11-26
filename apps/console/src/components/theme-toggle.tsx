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
 * cookie to render the right theme on first paint, so there is no flash. `compact` shows a moon
 * icon instead of the words, for the narrow header of the signed-in shells; the accessible name
 * stays the same.
 */
export function ThemeToggle({
  initial,
  compact = false,
}: {
  initial: ConsoleTheme;
  compact?: boolean;
}) {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState<ConsoleTheme>(initial);
  const next: ConsoleTheme = theme === 'dark' ? 'light' : 'dark';

  function toggle() {
    applyTheme(next);
    setTheme(next);
  }

  return (
    // A toggle keeps one label; aria-pressed carries the state, so "Dark mode, pressed" means on.
    <Button
      variant={compact ? 'ghost' : 'secondary'}
      size={compact ? 'icon' : 'sm'}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      {compact ? (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          </svg>
          <span className="sr-only">{t('darkMode')}</span>
        </>
      ) : (
        t('darkMode')
      )}
    </Button>
  );
}
