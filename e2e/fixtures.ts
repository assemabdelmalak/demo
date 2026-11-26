import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** WCAG 2.2 AA (PRD §7): no serious or critical axe violation on any screen (UX §9). */
async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) => `${violation.id}: ${violation.help} (${String(violation.nodes.length)} nodes)`,
    );
  expect(blocking, blocking.join('\n')).toEqual([]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** proxy.ts gives every page a request ID and keeps a valid one the caller sent (P0-T09). */
export async function expectRequestIds(request: APIRequestContext, path = '/'): Promise<void> {
  const minted = (await request.get(path)).headers()['x-request-id'];
  expect(minted).toMatch(UUID);

  const incoming = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
  const kept = await request.get(path, { headers: { 'x-request-id': incoming } });
  expect(kept.headers()['x-request-id']).toBe(incoming);

  const forged = await request.get(path, { headers: { 'x-request-id': 'forged-request-id' } });
  expect(forged.headers()['x-request-id']).toMatch(UUID);
}

interface Fixtures {
  expectAccessible: () => Promise<void>;
  /**
   * Chromium logs every 4xx answer to `fetch` as "Failed to load resource: … status of 401".
   * A test that provokes one on purpose (a wrong password) names the status here; every other
   * console error still fails the test.
   */
  allowFailedRequests: (...statuses: number[]) => void;
}

const allowedStatuses = new WeakMap<Page, Set<number>>();

export const test = base.extend<Fixtures>({
  // Definition of Done: no console errors. Every page a test opens is watched.
  page: async ({ page }, use) => {
    const errors: string[] = [];
    allowedStatuses.set(page, new Set());
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const status = /Failed to load resource: .*status of (\d{3})/.exec(message.text())?.[1];
      if (status && allowedStatuses.get(page)?.has(Number(status))) return;
      errors.push(`${message.text()} (${message.location().url})`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(page);
    expect(errors, errors.join('\n')).toEqual([]);
  },
  allowFailedRequests: async ({ page }, use) => {
    await use((...statuses) => {
      for (const status of statuses) allowedStatuses.get(page)?.add(status);
    });
  },
  expectAccessible: async ({ page }, use) => {
    await use(() => expectNoSeriousA11yViolations(page));
  },
});

export { expect };
