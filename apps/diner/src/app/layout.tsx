import { type Metadata, type Viewport } from 'next';
import { Readex_Pro } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { ApiProvider } from '@radd/api-client/react';
import { loadPublicEnv } from '@radd/config/env';
import { dirFor, type UiLocale } from '@radd/shared/i18n';

import { PublicEnvScript } from '@/components/public-env-script';

import './globals.css';

// One variable family covering Arabic and Latin: at most two font files on first load (UX §10).
const readex = Readex_Pro({
  subsets: ['arabic', 'latin'],
  variable: '--font-readex',
  display: 'swap',
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
    <html lang={locale} dir={dirFor(locale)} className={readex.variable}>
      <body className="min-h-dvh antialiased">
        <PublicEnvScript env={env} />
        <NextIntlClientProvider>
          <ApiProvider baseUrl={env.NEXT_PUBLIC_API_URL}>{children}</ApiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
