import { randomUUID } from 'node:crypto';

import { type Page } from '@playwright/test';

import { field, localeOf, submitPastRateLimit, text } from './console-helpers';
import { expect, test } from './fixtures';

/**
 * The account journeys against the running stack (P1-T04): sign up, confirm the email with the
 * code from the mail catcher, create an organisation, land in the owner shell, sign out and in.
 * Runs in English (tablet-console) and Arabic (tablet-console-ar). Needs the API, worker and a
 * Mailpit-compatible inbox (Mailpit in CI, infra/scripts/mail-catcher.mjs without Docker).
 */

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const PASSWORD = 'a long and memorable sentence';

function uniqueEmail(label: string): string {
  return `e2e.${label}.${String(Date.now())}.${String(Math.floor(Math.random() * 1e6))}@radd.test`;
}

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

/** The text of the newest email to `address` that `matches`, polling Mailpit's HTTP API. */
async function latestMail(
  page: Page,
  address: string,
  matches: (text: string) => boolean,
): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const list = (await (
      await page.request.get(`${MAILPIT_URL}/api/v1/messages?limit=200`)
    ).json()) as { messages: MailSummary[] };
    const message = list.messages.find((item) =>
      item.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
    );
    if (message) {
      const full = (await (
        await page.request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`)
      ).json()) as { Text: string };
      if (matches(full.Text)) return full.Text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`no matching email to ${address}`);
}

/** The 6-digit code in the newest email to `address`. */
async function latestCode(page: Page, address: string): Promise<string> {
  const textOf = await latestMail(page, address, (body) => /^\d{6}\s*$/m.test(body));
  const code = /^(\d{6})\s*$/m.exec(textOf)?.[1];
  if (!code) throw new Error(`no code emailed to ${address}`);
  return code;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('console accounts @smoke', () => {
  test('sign up, confirm, create an organisation, sign out and back in', async ({
    page,
    context,
    baseURL,
    expectAccessible,
    allowFailedRequests,
  }) => {
    test.setTimeout(120_000);
    // 429 only if the sign-in limit is hit (see submitPastRateLimit).
    allowFailedRequests(429);
    const locale = localeOf();
    const email = uniqueEmail(locale);
    const organization = `E2E ${locale === 'ar' ? 'مطعم' : 'Kitchen'} ${String(Date.now())}`;

    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.getByRole('link', { name: text('auth.signIn.signUp') }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('auth.signUp.title'));
    await field(page, text('auth.common.name')).fill('Rana Haddad');
    await field(page, text('auth.common.email')).fill(email);
    await field(page, text('auth.common.password')).fill(PASSWORD);
    await submitPastRateLimit(page, text('auth.signUp.submit'));

    await expect(page).toHaveURL(/\/verify-email\?/);
    await expect(field(page, text('auth.common.email'))).toHaveValue(email);
    const code = await latestCode(page, email);
    await field(page, text('auth.common.code')).fill(code);
    await submitPastRateLimit(page, text('auth.verifyEmail.submit'));

    await expect(page).toHaveURL(/\/onboarding\/organization$/);
    await field(page, text('auth.onboarding.name')).fill(organization);
    await page.getByRole('button', { name: text('auth.onboarding.submit') }).click();

    await expect(page).toHaveURL(/\/menu$/);
    const header = page.locator('header');
    await expect(header).toContainText(organization);
    await expect(header).toContainText(text('roleBadge.owner'));
    const nav = page.getByRole('navigation', { name: text('shell.navLabel') });
    for (const key of ['menu', 'allergens', 'tables', 'team', 'insights', 'settings']) {
      await expect(nav.getByRole('link', { name: text(`nav.${key}`), exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: text('nav.menu'), exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Owners are not sent to staff or kitchen pages.
    await page.goto('/floor');
    await expect(page).toHaveURL(/\/menu$/);

    // The owner shell in both themes, and at phone width with the navigation in a sheet.
    await expectAccessible();
    await context.addCookies([{ name: 'radd_console_theme', value: 'dark', url: baseURL ?? '' }]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectAccessible();
    await context.addCookies([{ name: 'radd_console_theme', value: 'light', url: baseURL ?? '' }]);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.reload();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: text('shell.openMenu') }).click();
    const sheetNav = page.getByRole('dialog').getByRole('navigation');
    await sheetNav.getByRole('link', { name: text('nav.team'), exact: true }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('nav.team'));
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.getByRole('button', { name: text('shell.account') }).click();
    await page.getByRole('menuitem', { name: text('shell.signOut') }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    // Signed out for real: the shell sends us back to sign-in, remembering where we were.
    await page.goto('/menu');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmenu$/);

    await field(page, text('auth.common.email')).fill(email);
    await field(page, text('auth.common.password')).fill(PASSWORD);
    await submitPastRateLimit(page, text('auth.signIn.submit'));
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.locator('header')).toContainText(organization);

    // The API's queue reaches the worker (carried from P0 into P1-T06): an invitation is put on
    // `notify.email` by the API and only the worker sends it, so its arrival proves both halves
    // agree on the queue name, prefix and payload.
    const invitee = uniqueEmail(`${locale}-invitee`);
    const invited = await page.request.post(`${API_URL}/v1/invitations`, {
      headers: { origin: new URL(baseURL ?? '').origin, 'idempotency-key': randomUUID() },
      data: { email: invitee, role: 'staff' },
    });
    expect(invited.status()).toBe(201);
    const invitation = await latestMail(page, invitee, (body) =>
      body.includes('/accept-invitation/'),
    );
    expect(invitation).toContain(organization);
  });

  test('a wrong password gets a translated message, not the server text', async ({
    page,
    allowFailedRequests,
  }) => {
    test.setTimeout(60_000);
    allowFailedRequests(401, 429);
    await page.goto('/sign-in');
    await field(page, text('auth.common.email')).fill(uniqueEmail('nobody'));
    await field(page, text('auth.common.password')).fill('not the password');
    await submitPastRateLimit(page, text('auth.signIn.submit'));
    const alert = page.locator('[data-slot=alert]');
    await expect(alert).toHaveText(text('errors.invalidCredentials'));
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).not.toContainText('Invalid email or password');
    // Focus stays usable: the submit button is not disabled under the keyboard.
    await expect(
      page.getByRole('button', { name: text('auth.signIn.submit'), exact: true }),
    ).toBeEnabled();
  });

  test('field errors are translated and tied to their fields', async ({ page }) => {
    await page.goto('/sign-up');
    await field(page, text('auth.common.email')).fill('not-an-email');
    await field(page, text('auth.common.password')).fill('short');
    await page.getByRole('button', { name: text('auth.signUp.submit') }).click();
    const email = field(page, text('auth.common.email'));
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(text('validation.email.invalid_format'));
    await expect(field(page, text('auth.common.name'))).toBeFocused();
    await expect(page.getByText(text('validation.newPassword.too_small'))).toBeVisible();
  });

  test('codes stay left to right and accept pasted Arabic digits', async ({ page }) => {
    await page.goto('/verify-email?email=someone%40radd.test');
    const code = field(page, text('auth.common.code'));
    await expect(code).toHaveAttribute('dir', 'ltr');
    await expect(code).toHaveAttribute('inputmode', 'numeric');
    await code.fill('١٢٣ ٤٥٦');
    await expect(code).toHaveValue('123456');
  });

  test('a crafted next cannot send someone off the site', async ({ page }) => {
    await page.goto('/sign-in?next=%2F%2Fevil.example');
    await expect(page.getByRole('link', { name: text('auth.signIn.signUp') })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`account pages have no serious accessibility violations (${theme})`, async ({
      page,
      context,
      baseURL,
      expectAccessible,
    }) => {
      await context.addCookies([{ name: 'radd_console_theme', value: theme, url: baseURL ?? '' }]);
      for (const path of ['/sign-in', '/sign-up', '/verify-email?email=a%40radd.test']) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectAccessible();
      }
      // The code tab of sign-in, too.
      await page.goto('/sign-in');
      await page.getByRole('tab', { name: text('auth.signIn.withCode') }).click();
      await expectAccessible();
    });
  }

  test('account pages fit a 360 px screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/verify-email?email=a%40radd.test',
      '/forgot-password',
      '/reset-password?email=a%40radd.test',
    ]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      for (const control of await page.locator('button, [role=tab], input').all()) {
        const box = await control.boundingBox();
        expect(
          box?.height,
          `${path} ${(await control.getAttribute('name')) ?? ''}`,
        ).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
