'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { LOCALE_COOKIE, type UiLocale } from '@radd/shared/i18n';
import { cn } from '@radd/ui';

const OPTIONS: readonly UiLocale[] = ['en', 'ar'];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function persistLocale(locale: UiLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${String(ONE_YEAR_SECONDS)}; samesite=lax`;
}

/** "EN / ع" segmented control (UX §6.1). The choice is a cookie, so it survives the next visit. */
export function LanguageSwitch() {
  const t = useTranslations('language');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: UiLocale) {
    persistLocale(locale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex rounded-chip border border-line p-0.5"
    >
      {OPTIONS.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={current === locale}
          disabled={pending}
          onClick={() => {
            choose(locale);
          }}
          className={cn(
            'min-h-11 min-w-11 rounded-chip px-3 text-small font-semibold',
            current === locale ? 'bg-primary text-on-primary' : 'text-ink',
          )}
        >
          {/* Short visible label, full name for screen readers (WCAG 2.5.3 label in name). */}
          <span aria-hidden="true">{t(`short.${locale}`)}</span>
          <span className="sr-only">{t(`name.${locale}`)}</span>
        </button>
      ))}
    </div>
  );
}
