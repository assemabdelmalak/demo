import { type Metadata, type Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { ApiProvider } from '@radd/api-client/react';
import { loadPublicEnv } from '@radd/config/env';
import { dirFor, type UiLocale } from '@radd/shared/i18n';
import { DirectionProvider } from '@radd/ui';

import { PublicEnvScript } from '@/components/public-env-script';
import { parseConsoleTheme, THEME_COOKIE } from '@/lib/theme';

import './globals.css';

// Console type: IBM Plex Sans for Latin, IBM Plex Sans Arabic for Arabic (UX §2), self-hosted
// from Fontsource (OFL) so builds never depend on Google Fonts. No metric-adjusted fallbacks: one
// would sit between the two faces in the stack, and the local Arial it uses has Arabic glyphs on
// Windows and macOS, so Arabic would render in Arial.
const plex = localFont({
  src: '../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2',
  weight: '100 700',
  variable: '--font-plex',
  display: 'swap',
  adjustFontFallback: false,
});
// Four static weights; loaded when Arabic text needs them rather than preloaded on every page.
const plexArabic = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
    },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as UiLocale;
  const theme = parseConsoleTheme((await cookies()).get(THEME_COOKIE)?.value);
  const env = loadPublicEnv('console');
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme={theme}
      className={`${plex.variable} ${plexArabic.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <PublicEnvScript env={env} />
        <NextIntlClientProvider>
          <ApiProvider baseUrl={env.NEXT_PUBLIC_API_URL}>
            <DirectionProvider dir={dirFor(locale)}>{children}</DirectionProvider>
          </ApiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
