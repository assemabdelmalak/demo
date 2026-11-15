import { describe, expect, it } from 'vitest';

import { MEMBER_ROLES, type MemberRole } from './enums.js';
import { DomainError } from './errors.js';
import {
  type Action,
  ACTIONS,
  type Actor,
  assertCan,
  can,
  holdsPermission,
  inviteActionFor,
  isAction,
  type MemberActor,
  PERMISSIONS,
} from './permissions.js';

/**
 * The expected matrix, written out by hand from GROUP_ORDERING §6, API §4 and ADR-025/026. It is
 * deliberately not derived from the implementation: a change to `PERMISSIONS` must change this
 * table too. Columns: owner, manager, staff, kitchen, staff PIN session, kitchen PIN session.
 * `c` = held, subject to the target check (see the conditional tests below).
 */
// prettier-ignore
const EXPECTED: Record<Action, readonly [string, string, string, string, string, string]> = {
  'org.read':                      ['y', 'y', 'y', 'y', '-', '-'],
  'org.update':                    ['y', 'y', '-', '-', '-', '-'],
  'org.delete':                    ['y', '-', '-', '-', '-', '-'],
  'org.billing':                   ['y', '-', '-', '-', '-', '-'],
  'org.ownership.transfer':        ['y', '-', '-', '-', '-', '-'],
  'team.read':                     ['y', 'y', 'y', 'y', '-', '-'],
  'team.invite.manager':           ['y', '-', '-', '-', '-', '-'],
  'team.invite.staff':             ['y', 'y', '-', '-', '-', '-'],
  'team.member.update':            ['c', 'c', '-', '-', '-', '-'],
  'team.remove':                   ['c', 'c', '-', '-', '-', '-'],
  'team.role.change':              ['c', 'c', '-', '-', '-', '-'],
  'team.pin.set':                  ['c', 'c', '-', '-', '-', '-'],
  'devices.manage':                ['y', 'y', '-', '-', '-', '-'],
  'account.notifications':         ['y', 'y', '-', '-', '-', '-'],
  'restaurant.create':             ['y', 'y', '-', '-', '-', '-'],
  'restaurant.read':               ['y', 'y', 'y', 'y', 'y', 'y'],
  'restaurant.update':             ['y', 'y', '-', '-', '-', '-'],
  'ai.settings':                   ['y', 'y', '-', '-', '-', '-'],
  'assets.manage':                 ['y', 'y', '-', '-', '-', '-'],
  'menu.read':                     ['y', 'y', 'y', '-', 'y', '-'],
  'menu.edit':                     ['y', 'y', '-', '-', '-', '-'],
  'menu.availability':             ['y', 'y', 'y', '-', 'y', '-'],
  'menu.publish':                  ['y', 'y', '-', '-', '-', '-'],
  'allergens.edit':                ['y', 'y', '-', '-', '-', '-'],
  'allergens.confirm':             ['y', 'y', '-', '-', '-', '-'],
  'import.run':                    ['y', 'y', '-', '-', '-', '-'],
  'tables.manage':                 ['y', 'y', '-', '-', '-', '-'],
  'insights.read':                 ['y', 'y', '-', '-', '-', '-'],
  'conversations.read':            ['y', 'y', '-', '-', '-', '-'],
  'reports.read':                  ['y', 'y', '-', '-', '-', '-'],
  'session.read':                  ['y', 'y', 'y', '-', 'y', '-'],
  'session.item.manage':           ['y', 'y', 'y', '-', 'y', '-'],
  'session.guest.create':          ['y', 'y', 'y', '-', 'y', '-'],
  'session.participant.remove':    ['y', 'y', 'y', '-', 'y', '-'],
  'session.participant.merge':     ['y', 'y', 'y', '-', 'y', '-'],
  'session.lock':                  ['y', 'y', 'y', '-', 'y', '-'],
  'round.decide':                  ['y', 'y', 'y', '-', 'y', '-'],
  'item.void.before_preparing':    ['y', 'y', 'y', '-', 'y', '-'],
  'item.void.any':                 ['y', 'y', '-', '-', '-', '-'],
  'bill.split':                    ['y', 'y', 'y', '-', 'y', '-'],
  'discount.apply':                ['y', 'y', '-', '-', '-', '-'],
  'payment.record':                ['y', 'y', 'y', '-', 'y', '-'],
  'payment.void':                  ['y', 'y', '-', '-', '-', '-'],
  'bill.request':                  ['y', 'y', 'y', '-', 'y', '-'],
  'session.close':                 ['y', 'y', 'y', '-', 'y', '-'],
  'session.force_close':           ['y', 'y', '-', '-', '-', '-'],
  'session.reopen.bill_requested': ['y', 'y', 'y', '-', 'y', '-'],
  'session.reopen.closed':         ['y', 'y', '-', '-', '-', '-'],
  'session.transfer':              ['y', 'y', 'y', '-', 'y', '-'],
  'session.merge':                 ['y', 'y', '-', '-', '-', '-'],
  'waiter_call.handle':            ['y', 'y', 'y', '-', 'y', '-'],
  'kitchen.read':                  ['y', 'y', 'y', 'y', 'y', 'y'],
  'kitchen.bump':                  ['y', 'y', 'y', 'y', 'y', 'y'],
};

const ORG = '0190a000-0000-7000-8000-000000000001';
const USER = '0190a000-0000-7000-8000-000000000002';

const member = (role: MemberRole, pinSession = false): MemberActor => ({
  kind: 'member',
  userId: USER,
  organizationId: ORG,
  role,
  pinSession,
});

const COLUMNS: readonly [string, Actor][] = [
  ['owner', member('owner')],
  ['manager', member('manager')],
  ['staff', member('staff')],
  ['kitchen', member('kitchen')],
  ['staff PIN', member('staff', true)],
  ['kitchen PIN', member('kitchen', true)],
];

/** A target every holder of a conditional action may manage. */
const EASY_TARGET = { targetRole: 'staff', newRole: 'kitchen' } as const;

function allowed(actor: Actor, action: Action): boolean {
  // The conditional actions take a resource; the others ignore the argument's absence.
  return (can as (a: Actor, x: Action, r?: unknown) => boolean)(actor, action, EASY_TARGET);
}

describe('the permission matrix', () => {
  it('lists every action once in the expected table, and nothing else', () => {
    expect(new Set(ACTIONS).size).toBe(ACTIONS.length);
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
    for (const action of ACTIONS) expect(action).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  const cases = ACTIONS.flatMap((action) =>
    COLUMNS.map(([label, actor], index) => ({
      action,
      label,
      actor,
      cell: EXPECTED[action][index],
    })),
  );

  it.each(cases)('$label → $action: $cell', ({ action, actor, cell }) => {
    const expected = cell === 'y' || cell === 'c';
    expect(holdsPermission(actor, action)).toBe(expected);
    expect(allowed(actor, action)).toBe(expected);
  });

  it.each(ACTIONS)('super admin and system hold no console action: %s', (action) => {
    for (const actor of [{ kind: 'super_admin', userId: USER }, { kind: 'system' }] as Actor[]) {
      expect(holdsPermission(actor, action)).toBe(false);
      expect(allowed(actor, action)).toBe(false);
    }
  });

  it('grants every action to at least one role, and all of them to the owner', () => {
    for (const action of ACTIONS) {
      expect(
        MEMBER_ROLES.some((role) => PERMISSIONS[role].has(action)),
        action,
      ).toBe(true);
      expect(PERMISSIONS.owner.has(action), action).toBe(true);
    }
  });

  it('never lets a PIN session reach organisation, team, device or account actions', () => {
    for (const role of MEMBER_ROLES) {
      for (const action of ACTIONS) {
        if (/^(org|team|devices|account)\./.test(action)) {
          expect(holdsPermission(member(role, true), action), `${role} ${action}`).toBe(false);
        }
      }
    }
  });

  it('gives a PIN session of an owner or manager nothing at all', () => {
    for (const action of ACTIONS) {
      expect(holdsPermission(member('owner', true), action)).toBe(false);
      expect(holdsPermission(member('manager', true), action)).toBe(false);
    }
  });

  it('refuses unknown action names at runtime', () => {
    expect(isAction('org.read')).toBe(true);
    expect(isAction('org.everything')).toBe(false);
    expect(can(member('owner'), 'org.everything' as Action)).toBe(false);
  });
});

describe('conditional rules', () => {
  type Row = readonly [MemberRole, MemberRole, boolean];
  // [actor, target, allowed]
  // prettier-ignore
  const MANAGE: readonly Row[] = [
    ['owner', 'owner', false], ['owner', 'manager', true], ['owner', 'staff', true], ['owner', 'kitchen', true],
    ['manager', 'owner', false], ['manager', 'manager', false], ['manager', 'staff', true], ['manager', 'kitchen', true],
    ['staff', 'owner', false], ['staff', 'manager', false], ['staff', 'staff', false], ['staff', 'kitchen', false],
    ['kitchen', 'owner', false], ['kitchen', 'manager', false], ['kitchen', 'staff', false], ['kitchen', 'kitchen', false],
  ];

  it.each(MANAGE)('%s removing or renaming a %s: %s', (actor, targetRole, expected) => {
    expect(can(member(actor), 'team.remove', { targetRole })).toBe(expected);
    expect(can(member(actor), 'team.member.update', { targetRole })).toBe(expected);
  });

  // prettier-ignore
  const PIN: readonly Row[] = [
    ['owner', 'owner', false], ['owner', 'manager', false], ['owner', 'staff', true], ['owner', 'kitchen', true],
    ['manager', 'owner', false], ['manager', 'manager', false], ['manager', 'staff', true], ['manager', 'kitchen', true],
    ['staff', 'staff', false], ['staff', 'kitchen', false], ['kitchen', 'kitchen', false],
  ];

  it.each(PIN)('%s setting the PIN of a %s: %s', (actor, targetRole, expected) => {
    expect(can(member(actor), 'team.pin.set', { targetRole })).toBe(expected);
  });

  // prettier-ignore
  const ROLE_CHANGE: readonly (readonly [MemberRole, MemberRole, MemberRole, boolean])[] = [
    ['owner', 'staff', 'manager', true],
    ['owner', 'manager', 'kitchen', true],
    ['owner', 'kitchen', 'staff', true],
    ['owner', 'staff', 'owner', false],   // ownership moves only through org.ownership.transfer
    ['owner', 'owner', 'manager', false],
    ['manager', 'staff', 'kitchen', true],
    ['manager', 'kitchen', 'staff', true],
    ['manager', 'staff', 'manager', false],
    ['manager', 'manager', 'staff', false],
    ['manager', 'owner', 'staff', false],
    ['staff', 'kitchen', 'staff', false],
    ['kitchen', 'kitchen', 'staff', false],
  ];

  it.each(ROLE_CHANGE)('%s changing a %s to %s: %s', (actor, targetRole, newRole, expected) => {
    expect(can(member(actor), 'team.role.change', { targetRole, newRole })).toBe(expected);
  });

  it('refuses a conditional action whose resource is missing', () => {
    const loose = can as (a: Actor, x: Action, r?: unknown) => boolean;
    expect(loose(member('owner'), 'team.remove')).toBe(false);
    expect(loose(member('owner'), 'team.role.change')).toBe(false);
    expect(loose(member('owner'), 'team.pin.set')).toBe(false);
  });

  it('maps an invited role to the action it needs', () => {
    expect(inviteActionFor('manager')).toBe('team.invite.manager');
    expect(inviteActionFor('staff')).toBe('team.invite.staff');
    expect(inviteActionFor('kitchen')).toBe('team.invite.staff');
  });
});

describe('assertCan', () => {
  it('throws FORBIDDEN naming the action, and passes silently when allowed', () => {
    expect(() => {
      assertCan(member('owner'), 'org.delete');
    }).not.toThrow();
    try {
      assertCan(member('manager'), 'org.delete');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('FORBIDDEN');
      expect((error as DomainError).detail).toBe('Not allowed: org.delete');
    }
    expect(() => {
      assertCan(member('manager'), 'team.remove', { targetRole: 'manager' });
    }).toThrow(DomainError);
  });
});
