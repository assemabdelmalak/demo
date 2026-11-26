import { describe, expect, it } from 'vitest';

import { type Action, MEMBER_ROLES, PERMISSIONS } from '@radd/shared';

import { DISABLED_AUTH_PATHS, organizationRoles } from './auth.config';

type Statement = Parameters<(typeof organizationRoles)['owner']['authorize']>[0];

interface Mapping {
  /** Better Auth's statement for the operation. */
  statement: Statement;
  /** Our action for the same operation. */
  action: Action;
  /** Better Auth's own endpoint for it, which must stay disabled: our wrapper is the only path. */
  directPath: (typeof DISABLED_AUTH_PATHS)[number];
  /**
   * Our service calls Better Auth's server API for it with the caller's session, so Better Auth
   * must allow exactly the roles our matrix allows, or the call fails (or would let more through).
   */
  delegated: boolean;
}

/**
 * Better Auth's organisation statements against `packages/shared/src/permissions.ts`. They differ
 * on purpose in one place: Better Auth lets a manager (its `admin`) invite managers and manage
 * other managers, which ADR-025 forbids. That is safe only while every such endpoint is disabled
 * and our wrappers check the matrix first, which is what this test pins down.
 */
const MAPPINGS: readonly Mapping[] = [
  {
    statement: { invitation: ['create'] },
    action: 'team.invite.staff',
    directPath: '/organization/invite-member',
    delegated: true,
  },
  {
    statement: { organization: ['update'] },
    action: 'org.update',
    directPath: '/organization/update',
    delegated: true,
  },
  {
    statement: { organization: ['delete'] },
    action: 'org.delete',
    directPath: '/organization/delete',
    delegated: false,
  },
  {
    statement: { invitation: ['cancel'] },
    action: 'team.invite.staff',
    directPath: '/organization/cancel-invitation',
    delegated: false,
  },
  {
    statement: { member: ['delete'] },
    action: 'team.remove',
    directPath: '/organization/remove-member',
    delegated: false,
  },
  {
    statement: { member: ['update'] },
    action: 'team.role.change',
    directPath: '/organization/update-member-role',
    delegated: false,
  },
];

const betterAuthAllows = (role: (typeof MEMBER_ROLES)[number], statement: Statement): boolean =>
  organizationRoles[role].authorize(statement).success;

describe('Better Auth organisation roles stay consistent with the permission matrix', () => {
  it('defines exactly our member roles', () => {
    expect(Object.keys(organizationRoles).sort()).toEqual([...MEMBER_ROLES].sort());
  });

  it.each(MAPPINGS)('keeps $directPath disabled', ({ directPath }) => {
    expect(DISABLED_AUTH_PATHS).toContain(directPath);
  });

  it('keeps organisation creation and leaving behind our own endpoints too', () => {
    expect(DISABLED_AUTH_PATHS).toContain('/organization/create');
    expect(DISABLED_AUTH_PATHS).toContain('/organization/leave');
  });

  const delegated = MAPPINGS.filter((mapping) => mapping.delegated).flatMap((mapping) =>
    MEMBER_ROLES.map((role) => ({ ...mapping, role })),
  );

  it.each(delegated)(
    '$role: Better Auth and the matrix agree on $action',
    ({ role, statement, action }) => {
      expect(betterAuthAllows(role, statement)).toBe(PERMISSIONS[role].has(action));
    },
  );

  it('gives staff and kitchen no Better Auth organisation statement at all', () => {
    for (const role of ['staff', 'kitchen'] as const) {
      for (const { statement } of MAPPINGS) expect(betterAuthAllows(role, statement)).toBe(false);
    }
  });

  it('never gives Better Auth roles more than the matrix, except through disabled endpoints', () => {
    for (const role of MEMBER_ROLES) {
      for (const { statement, action, directPath } of MAPPINGS) {
        if (betterAuthAllows(role, statement) && !PERMISSIONS[role].has(action)) {
          expect(DISABLED_AUTH_PATHS, `${role} ${action}`).toContain(directPath);
        }
      }
    }
  });
});
