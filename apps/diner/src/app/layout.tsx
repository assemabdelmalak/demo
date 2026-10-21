import { type Metadata, type Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { ApiProvider } from '@radd/api-client/react';
import { loadPublicEnv } from '@radd/config/env';
import { dirFor, type UiLocale } from '@radd/shared/i18n';
import { DirectionProvider } from '@radd/ui';

import { PublicEnvScript } from '@/components/public-env-script';

import './globals.css';

// Readex Pro, self-hosted from Fontsource (OFL) so builds never depend on Google Fonts. One
// variable typeface in two files, Latin and Arabic: at most two font files on first load (UX §10).
// No metric-adjusted fallback: it would sit between the two faces in the stack, and the local
// Arial it uses has Arabic glyphs on Windows and macOS, so Arabic would render in Arial.
const readexLatin = localFont({
  src: '../../node_modules/@fontsource-variable/readex-pro/files/readex-pro-latin-wght-normal.woff2',
  weight: '160 700',
  variable: '--font-readex-latin',
  display: 'swap',
  adjustFontFallback: false,
});
const readexArabic = localFont({
  src: '../../node_modules/@fontsource-variable/readex-pro/files/readex-pro-arabic-wght-normal.woff2',
  weight: '160 700',
  variable: '--font-readex-arabic',
  display: 'swap',
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as UiLocale;
  const env = loadPublicEnv('diner');
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${readexLatin.variable} ${readexArabic.variable}`}
    >
      <body className="min-h-dvh antialiased">
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
