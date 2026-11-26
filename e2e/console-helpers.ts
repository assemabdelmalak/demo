import { readFileSync } from 'node:fs';

import { type Page } from '@playwright/test';

import { test } from './fixtures';

/** Shared by the console journeys: message lookup in the project's locale, fields, sign-in pacing. */

type Messages = { [key: string]: string | Messages };
type Locale = 'en' | 'ar';

const catalogues: Record<Locale, Messages> = {
  en: JSON.parse(
    readFileSync(new URL('../apps/console/messages/en.json', import.meta.url), 'utf8'),
  ) as Messages,
  ar: JSON.parse(
    readFileSync(new URL('../apps/console/messages/ar.json', import.meta.url), 'utf8'),
  ) as Messages,
};

export function localeOf(): Locale {
  return test.info().project.name.endsWith('-ar') ? 'ar' : 'en';
}

/** A catalogue string by dotted key; ICU placeholders are cut off, so use the text before them. */
export function text(key: string, locale = localeOf()): string {
  let node: string | Messages | undefined = catalogues[locale];
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`no message ${key} in ${locale}`);
  return node;
}

/**
 * Clicks `button` and, if Better Auth's per-IP limit answers first (3 sign-ups or sign-ins per
 * 10 s, a few code checks a minute), waits as long as the message says and clicks again. Both
 * locales run in parallel from one IP, so CI hits the limit now and then; the wait shown is
 * itself part of what is checked.
 */
export async function submitPastRateLimit(page: Page, button: string): Promise<void> {
  const start = new URL(page.url()).pathname;
  const prefix = text('errors.rateLimitedLater').split('.')[0] ?? '';
  const limited = page.getByRole('alert').filter({ hasText: prefix });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const outcome = await Promise.race([
      limited.waitFor({ timeout: 5_000 }).then(() => 'limited' as const),
      page
        .waitForURL((url) => url.pathname !== start, { timeout: 5_000 })
        .then(() => 'moved' as const),
    ]).catch(() => 'stayed' as const);
    if (outcome !== 'limited') return;
    const seconds = Number(/\d+/.exec((await limited.textContent()) ?? '')?.[0] ?? 10);
    await page.waitForTimeout((seconds + 1) * 1000);
  }
}

/** The input labelled `label` (a tab panel can carry the same name as its password field). */
export function field(page: Page, label: string) {
  return page.locator('input').and(page.getByLabel(label, { exact: true }));
}
