import { expect, expectRequestIds, test } from './fixtures';

test.describe('diner home @smoke', () => {
  test('renders in the project language with the right direction', async ({ page }, testInfo) => {
    const arabic = testInfo.project.name === 'mobile-ar';
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', arabic ? 'ar' : 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', arabic ? 'rtl' : 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Radd Menu');
    await expect(
      page.getByText(arabic ? 'امسح الرمز لتصفّح القائمة والطلب' : 'Scan to see the menu & order'),
    ).toBeVisible();
  });

  test('stays English when the browser prefers Arabic but no language was chosen (ADR-009)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      locale: 'ar-LB',
      extraHTTPHeaders: { 'accept-language': 'ar-LB,ar;q=0.9' },
    });
    // Playwright merges the project's storage state (the Arabic project's cookie) into new
    // contexts; this test is about a visitor who never chose a language.
    await context.clearCookies();
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await context.close();
  });

  test('the language switch flips language and direction, and remembers the choice', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('has no serious accessibility violations', async ({ page, expectAccessible }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible();
  });

  test('every control is a 44 px tap target at 360 px (UX §9)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    for (const control of await page.locator('button, a, [role=tab]').all()) {
      const box = await control.boundingBox();
      expect(box?.height, (await control.textContent()) ?? '').toBeGreaterThanOrEqual(44);
    }
  });

  test('tags every response with a request ID', async ({ request }) => {
    await expectRequestIds(request);
  });

  test('answers the health check', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
