import { describe, expect, it } from 'vitest';

import {
  activeMembership,
  destinationFor,
  homeForRole,
  isActivePath,
  type Me,
  NAV_ITEMS,
  ONBOARDING_PATH,
  safeNextPath,
  shellForRole,
  signInHref,
  verifyEmailHref,
  withNext,
} from './navigation';

const ORG_A = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
const ORG_B = '0199f2a4-5b6c-7d8e-9f01-23456789abce';

function me(
  memberships: Me['memberships'],
  activeOrganizationId: string | null = memberships[0]?.organizationId ?? null,
): Me {
  return {
    user: {
      id: '0199f2a4-5b6c-7d8e-9f01-000000000001',
      name: 'Rana',
      email: 'rana@example.com',
      emailVerified: true,
      twoFactorEnabled: false,
    },
    session: {
      id: '0199f2a4-5b6c-7d8e-9f01-000000000002',
      activeOrganizationId,
      pinSession: false,
      staffDeviceId: null,
      twoFactorVerifiedAt: null,
      createdAt: '2026-11-15T00:00:00.000Z',
    },
    memberships,
  };
}

const member = (organizationId: string, role: Me['memberships'][number]['role']) => ({
  organizationId,
  name: `Org ${organizationId.slice(-1)}`,
  slug: 'org',
  role,
});

describe('safeNextPath', () => {
  it('keeps same-site paths with their query and hash', () => {
    expect(safeNextPath('/menu')).toBe('/menu');
    expect(safeNextPath('/accept-invitation/abc?x=1#top')).toBe('/accept-invitation/abc?x=1#top');
  });

  it('refuses anything that could leave the site', () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '/\nevil',
      '/\tevil',
      'javascript:alert(1)',
      'menu',
      '',
      `/${'a'.repeat(2048)}`,
      undefined,
      ['/menu'],
    ]) {
      expect(safeNextPath(next), JSON.stringify(next)).toBeNull();
    }
  });

  it('keeps an encoded control character encoded, which stays on the site', () => {
    expect(safeNextPath('/%0a/evil')).toBe('/%0a/evil');
  });

  it('normalises dot segments without leaving the site', () => {
    expect(safeNextPath('/a/../../menu')).toBe('/menu');
    expect(safeNextPath('/./evil.example')).toBe('/evil.example');
    expect(safeNextPath('/..//evil.example')).toBeNull();
    expect(safeNextPath('/a/..//evil.example')).toBeNull();
  });
});

describe('links that carry next', () => {
  it('encode a valid next and drop an invalid one', () => {
    expect(withNext('/sign-up', '/accept-invitation/1')).toBe(
      '/sign-up?next=%2Faccept-invitation%2F1',
    );
    expect(withNext('/sign-up', '//evil.example')).toBe('/sign-up');
    expect(signInHref('/menu?tab=2')).toBe('/sign-in?next=%2Fmenu%3Ftab%3D2');
    expect(signInHref('/')).toBe('/sign-in');
    expect(verifyEmailHref('a+b@c.co', '/team')).toBe(
      '/verify-email?email=a%2Bb%40c.co&next=%2Fteam',
    );
    expect(verifyEmailHref('a@c.co', null)).toBe('/verify-email?email=a%40c.co');
  });
});

describe('roles and shells', () => {
  it('puts owners and managers in one shell and gives each role its home', () => {
    expect(shellForRole('owner')).toBe('owner');
    expect(shellForRole('manager')).toBe('owner');
    expect(shellForRole('staff')).toBe('staff');
    expect(shellForRole('kitchen')).toBe('kitchen');
    expect(homeForRole('owner')).toBe('/menu');
    expect(homeForRole('manager')).toBe('/menu');
    expect(homeForRole('staff')).toBe('/floor');
    expect(homeForRole('kitchen')).toBe('/kitchen');
  });

  it('lists the sections of each shell', () => {
    const keys = (shell: keyof typeof NAV_ITEMS) => NAV_ITEMS[shell].map((item) => item.key);
    expect(keys('owner')).toEqual(['menu', 'allergens', 'tables', 'team', 'insights', 'settings']);
    expect(keys('staff')).toEqual(['floor', 'bills']);
    expect(keys('kitchen')).toEqual(['kitchen']);
    expect(keys('admin')).toEqual(['organizations', 'queues']);
    // No two shells share a URL, so a role can never land on another role's page by its link.
    const hrefs = Object.values(NAV_ITEMS).flatMap((items) => items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('marks a section and its sub-pages active, not a page that only shares a prefix', () => {
    expect(isActivePath('/menu', '/menu')).toBe(true);
    expect(isActivePath('/menu/items/1', '/menu')).toBe(true);
    expect(isActivePath('/menus', '/menu')).toBe(false);
  });
});

describe('where a signed-in person goes', () => {
  it('sends someone without an organisation to onboarding', () => {
    expect(destinationFor(me([]))).toBe(ONBOARDING_PATH);
  });

  it('sends members to their role home in the active organisation', () => {
    const both = me([member(ORG_A, 'owner'), member(ORG_B, 'kitchen')], ORG_B);
    expect(activeMembership(both)?.organizationId).toBe(ORG_B);
    expect(destinationFor(both)).toBe('/kitchen');
    expect(destinationFor(me([member(ORG_A, 'staff')]))).toBe('/floor');
  });

  it('falls back to the first membership when none is active', () => {
    expect(activeMembership(me([member(ORG_A, 'manager')], null))?.role).toBe('manager');
  });

  it('honours a safe next, also before onboarding (an invitation link)', () => {
    expect(destinationFor(me([]), '/accept-invitation/1')).toBe('/accept-invitation/1');
    expect(destinationFor(me([member(ORG_A, 'owner')]), '//evil.example')).toBe('/menu');
    expect(destinationFor(me([member(ORG_A, 'owner')]), '/')).toBe('/menu');
  });
});
