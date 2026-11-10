import { defineConfig, devices } from '@playwright/test';

const DINER_URL = process.env.E2E_DINER_URL ?? 'http://localhost:3000';
const CONSOLE_URL = process.env.E2E_CONSOLE_URL ?? 'http://localhost:3001';

/**
 * Browsers come from `playwright install` in CI. The agent's container ships an older Chromium,
 * so a path can be supplied instead.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

/** Arabic is reached by the language switch (ADR-009), so the Arabic project carries its cookie. */
function localeCookie(locale: 'en' | 'ar', url: string) {
  const cookie = {
    name: 'NEXT_LOCALE',
    value: locale,
    domain: new URL(url).hostname,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  };
  return { cookies: [cookie], origins: [] };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'mobile-en',
      testMatch: /diner\..*\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: DINER_URL, locale: 'en-US', launchOptions },
    },
    {
      name: 'mobile-ar',
      testMatch: /diner\..*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 780 },
        baseURL: DINER_URL,
        locale: 'ar-LB',
        storageState: localeCookie('ar', DINER_URL),
        launchOptions,
      },
    },
    {
      name: 'tablet-console',
      testMatch: /console\..*\.spec\.ts/,
      use: {
        viewport: { width: 1024, height: 768 },
        baseURL: CONSOLE_URL,
        locale: 'en-US',
        launchOptions,
      },
    },
    {
      name: 'stack',
      testMatch: /stack\..*\.spec\.ts/,
      use: { baseURL: process.env.E2E_API_URL ?? 'http://localhost:4000' },
    },
  ],
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : [
        {
          command: 'pnpm --filter @radd/diner start',
          url: `${DINER_URL}/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @radd/console start',
          url: `${CONSOLE_URL}/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
