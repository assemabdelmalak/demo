import { describe, expect, it } from 'vitest';

import { adminUpdateOrganizationSchema } from './admin.js';
import { isWeakPin, pinSwitchSchema, setMemberPinSchema } from './staff.js';

describe('quick-switch PIN rules', () => {
  it.each([
    '0000',
    '1111',
    '999999',
    '1234',
    '4321',
    '123456',
    '987654',
    '3456',
    '1212',
    '121212',
    '123123',
    '9090',
  ])('refuses the easily guessed %s', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
    expect(setMemberPinSchema.safeParse({ pin }).success).toBe(false);
  });

  it.each(['2580', '7391', '40213', '918273', '1123', '8086'])('accepts %s', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
    expect(setMemberPinSchema.parse({ pin })).toEqual({ pin });
  });

  it.each(['', '123', '1234567', '12a4', ' 2580', '２５８０', '25.0'])(
    'refuses %j, which is not 4 to 6 ASCII digits',
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
      expect(setMemberPinSchema.safeParse({ pin }).success).toBe(false);
    },
  );

  it('checks only the shape of a PIN offered at the switch, never its strength', () => {
    const memberId = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
    expect(pinSwitchSchema.parse({ memberId, pin: '1234' })).toEqual({ memberId, pin: '1234' });
    expect(pinSwitchSchema.safeParse({ memberId, pin: '12' }).success).toBe(false);
    expect(pinSwitchSchema.safeParse({ memberId: 'x', pin: '2580' }).success).toBe(false);
    expect(pinSwitchSchema.safeParse({ memberId, pin: '2580', role: 'owner' }).success).toBe(false);
  });
});

describe('admin organisation update', () => {
  it('needs a status or a plan and nothing else', () => {
    expect(adminUpdateOrganizationSchema.parse({ status: 'suspended' })).toEqual({
      status: 'suspended',
    });
    expect(adminUpdateOrganizationSchema.safeParse({}).success).toBe(false);
    expect(adminUpdateOrganizationSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(adminUpdateOrganizationSchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});
