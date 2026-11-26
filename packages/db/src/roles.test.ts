import { describe, expect, it } from 'vitest';

import { APP_ROLES, type RoleFacts, roleProblems } from './roles.js';

const plain = (name: string, overrides: Partial<RoleFacts> = {}): RoleFacts => ({
  name,
  superuser: false,
  bypassRls: false,
  createRole: false,
  createDb: false,
  memberOf: [],
  ownedRelations: 0,
  ...overrides,
});

const good = (): RoleFacts[] => [
  plain(APP_ROLES.migrator, { ownedRelations: 120 }),
  plain(APP_ROLES.runtime),
  plain(APP_ROLES.worker),
  plain(APP_ROLES.admin, { bypassRls: true }),
];

const withRole = (name: string, overrides: Partial<RoleFacts>) =>
  good().map((role) => (role.name === name ? { ...role, ...overrides } : role));

describe('roleProblems (ADR-021)', () => {
  it('accepts the roles the bootstrap creates', () => {
    expect(roleProblems(good(), APP_ROLES.migrator)).toEqual([]);
  });

  it('names every missing role', () => {
    expect(roleProblems([], APP_ROLES.migrator)).toHaveLength(4);
    const problems = roleProblems(
      good().filter((role) => role.name !== APP_ROLES.worker),
      APP_ROLES.migrator,
    );
    expect(problems).toEqual([expect.stringContaining('role app_worker does not exist')]);
  });

  it.each([APP_ROLES.runtime, APP_ROLES.worker])(
    'refuses %s when it could get around Row Level Security',
    (name) => {
      const check = (overrides: Partial<RoleFacts>) =>
        roleProblems(withRole(name, overrides), APP_ROLES.migrator);

      expect(check({ bypassRls: true })).toEqual([expect.stringContaining('BYPASSRLS')]);
      expect(check({ superuser: true })).toEqual([expect.stringContaining('superuser')]);
      expect(check({ createRole: true })).toEqual([expect.stringContaining('CREATEROLE')]);
      expect(check({ createDb: true })).toEqual([expect.stringContaining('CREATEDB')]);
      expect(check({ memberOf: [APP_ROLES.admin] })).toEqual([
        expect.stringContaining('member of app_admin'),
      ]);
      expect(check({ ownedRelations: 1 })).toEqual([expect.stringContaining('owns 1 relation')]);
    },
  );

  it('refuses a superuser migrator or admin, and an admin without BYPASSRLS', () => {
    expect(
      roleProblems(withRole(APP_ROLES.migrator, { superuser: true }), APP_ROLES.migrator),
    ).toEqual([expect.stringContaining('app_migrator must not be a superuser')]);
    expect(
      roleProblems(withRole(APP_ROLES.admin, { superuser: true }), APP_ROLES.migrator),
    ).toEqual([expect.stringContaining('app_admin must not be a superuser')]);
    expect(
      roleProblems(withRole(APP_ROLES.admin, { bypassRls: false }), APP_ROLES.migrator),
    ).toEqual([expect.stringContaining('needs BYPASSRLS')]);
  });

  it('refuses to migrate as anyone but the migrator', () => {
    expect(roleProblems(good(), 'postgres')).toEqual([
      expect.stringContaining('migrations must run as app_migrator (connected as postgres)'),
    ]);
  });
});
