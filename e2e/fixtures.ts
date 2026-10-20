import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

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

export const test = base.extend<{ expectAccessible: () => Promise<void> }>({
  expectAccessible: async ({ page }, use) => {
    await use(() => expectNoSeriousA11yViolations(page));
  },
});

export { expect };
