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

    // Radix widgets follow the page direction: laid out right to left, and the "next" arrow key
    // in RTL is ArrowLeft.
    const tabs = page.getByRole('tablist', { name: 'الأقسام' });
    await expect(tabs).toHaveCSS('direction', 'rtl');
    await page.getByRole('tab', { name: 'القائمة' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'الصالة مباشرة' })).toBeFocused();
  });

  test('the dark-mode switch changes the tokens and survives a reload', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    // One fixed label; the pressed state says whether dark mode is on.
    const toggle = page.getByRole('button', { name: 'Dark mode' });
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const light = await background();

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await background()).not.toBe(light);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('the language switch keeps keyboard focus', async ({ page }) => {
    await page.goto('/');
    const arabic = page.getByRole('button', { name: 'العربية' });
    await arabic.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.waitForLoadState('networkidle');
    await expect(arabic).toBeFocused();
  });

  test('unknown routes get a translated not-found page', async ({ request }) => {
    for (const [cookie, lang, title] of [
      ['', 'en', 'Page not found'],
      ['NEXT_LOCALE=ar', 'ar', 'الصفحة غير موجودة'],
    ] as const) {
      const response = await request.get('/no-such-page', { headers: cookie ? { cookie } : {} });
      expect(response.status()).toBe(404);
      const html = await response.text();
      expect(html).toContain(`lang="${lang}"`);
      expect(html).toContain(title);
    }
  });

  test('every control is a 44 px tap target at 360 px (UX §9)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    for (const control of await page.locator('button, [role=tab]').all()) {
      const box = await control.boundingBox();
      expect(box?.height, (await control.textContent()) ?? '').toBeGreaterThanOrEqual(44);
    }
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
