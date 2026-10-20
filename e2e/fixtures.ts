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
export async function expectRequestIds(request: APIRequestContext): Promise<void> {
  const minted = (await request.get('/')).headers()['x-request-id'];
  expect(minted).toMatch(UUID);

  const incoming = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
  const kept = await request.get('/', { headers: { 'x-request-id': incoming } });
  expect(kept.headers()['x-request-id']).toBe(incoming);

  const forged = await request.get('/', { headers: { 'x-request-id': 'forged-request-id' } });
  expect(forged.headers()['x-request-id']).toMatch(UUID);
}

export const test = base.extend<{ expectAccessible: () => Promise<void> }>({
  expectAccessible: async ({ page }, use) => {
    await use(() => expectNoSeriousA11yViolations(page));
  },
});

export { expect };
