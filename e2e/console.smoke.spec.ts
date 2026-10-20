import { expect, expectRequestIds, test } from './fixtures';

test.describe('console home @smoke', () => {
  test('defaults to English, left to right', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Radd Menu');
  });

  test('renders Arabic right to left after switching language', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText('لوحة التحكم')).toBeVisible();
  });

  test('the dark-mode switch changes the tokens and survives a reload', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect(html).toHaveAttribute('data-theme', 'light');
    const light = await background();

    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await background()).not.toBe(light);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Light mode' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  for (const [locale, theme] of [
    ['en', 'light'],
    ['ar', 'light'],
    ['en', 'dark'],
    ['ar', 'dark'],
  ] as const) {
    test(`has no serious accessibility violations (${locale}, ${theme})`, async ({
      page,
      context,
      baseURL,
      expectAccessible,
    }) => {
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        { name: 'radd_console_theme', value: theme, url: baseURL ?? '' },
      ]);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectAccessible();
    });
  }

  test('tags every response with a request ID', async ({ request }) => {
    await expectRequestIds(request);
  });

  test('answers the health check', async ({ request }) => {
    expect((await request.get('/healthz')).status()).toBe(200);
  });
});
