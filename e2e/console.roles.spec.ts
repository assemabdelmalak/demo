import { field, submitPastRateLimit, text } from './console-helpers';
import { expect, test } from './fixtures';

/**
 * The seeded Beit Tayta accounts (P1-T08, demo checkpoint P1): each role signs in with the
 * SEED_DATA password and lands in its own shell with its own navigation, in English
 * (tablet-console) and Arabic (tablet-console-ar). Needs `pnpm db:seed` on the running stack.
 */

const ORGANIZATION = 'Beit Tayta SAL';

const ROLES = [
  {
    role: 'owner',
    email: 'owner@beit-tayta.test',
    password: 'DemoOwner!2026',
    home: '/menu',
    nav: ['menu', 'allergens', 'tables', 'team', 'insights', 'settings'],
    elsewhere: '/floor',
  },
  {
    role: 'manager',
    email: 'manager@beit-tayta.test',
    password: 'DemoManager!2026',
    home: '/menu',
    nav: ['menu', 'allergens', 'tables', 'team', 'insights', 'settings'],
    elsewhere: '/kitchen',
  },
  {
    role: 'staff',
    email: 'staff@beit-tayta.test',
    password: 'DemoStaff!2026',
    home: '/floor',
    nav: ['floor', 'bills'],
    elsewhere: '/menu',
  },
  {
    role: 'kitchen',
    email: 'kitchen@beit-tayta.test',
    password: 'DemoKitchen!2026',
    home: '/kitchen',
    nav: ['kitchen'],
    elsewhere: '/bills',
  },
] as const;

const ALL_LINKS = [
  'menu',
  'allergens',
  'tables',
  'team',
  'insights',
  'settings',
  'floor',
  'bills',
  'kitchen',
];

test.describe('seeded roles @smoke', () => {
  for (const account of ROLES) {
    test(`the ${account.role} signs in and sees the ${account.role} navigation`, async ({
      page,
      allowFailedRequests,
    }) => {
      test.setTimeout(90_000);
      // 429 only if the sign-in limit is hit (both locales sign in four people from one IP).
      allowFailedRequests(429);
      await page.goto('/sign-in');
      await field(page, text('auth.common.email')).fill(account.email);
      await field(page, text('auth.common.password')).fill(account.password);
      await submitPastRateLimit(page, text('auth.signIn.submit'));

      await expect(page).toHaveURL(new RegExp(`${account.home}$`));
      const header = page.locator('header');
      await expect(header).toContainText(ORGANIZATION);
      await expect(header).toContainText(text(`roleBadge.${account.role}`));
      const nav = page.getByRole('navigation', { name: text('shell.navLabel') });
      for (const key of account.nav) {
        await expect(
          nav.getByRole('link', { name: text(`nav.${key}`), exact: true }),
        ).toBeVisible();
      }
      for (const key of ALL_LINKS.filter(
        (link) => !(account.nav as readonly string[]).includes(link),
      )) {
        await expect(nav.getByRole('link', { name: text(`nav.${key}`), exact: true })).toHaveCount(
          0,
        );
      }
      const [first] = account.nav;
      await expect(
        nav.getByRole('link', { name: text(`nav.${first}`), exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(text(`nav.${first}`));

      // Another shell's page sends the member back to their own home.
      await page.goto(account.elsewhere);
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));

      await page.getByRole('button', { name: text('shell.account') }).click();
      await page.getByRole('menuitem', { name: text('shell.signOut') }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }
});
