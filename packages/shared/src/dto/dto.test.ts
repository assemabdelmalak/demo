import { describe, expect, it } from 'vitest';

import { createInvitationSchema } from './invitations.js';
import {
  createOrganizationSchema,
  listMembersQuerySchema,
  updateOrganizationSchema,
} from './organizations.js';
import { createRestaurantSchema, listRestaurantsQuerySchema } from './restaurants.js';

describe('organisation DTOs', () => {
  it('trims the name and refuses empty, long or multi-line names', () => {
    expect(createOrganizationSchema.parse({ name: '  Beit Tayta ' })).toEqual({
      name: 'Beit Tayta',
    });
    expect(createOrganizationSchema.parse({ name: 'بيت تيتا' })).toEqual({ name: 'بيت تيتا' });
    for (const name of ['', '   ', 'x'.repeat(101), 'Beit\nTayta', 'Tab\there', 42]) {
      expect(createOrganizationSchema.safeParse({ name }).success).toBe(false);
    }
  });

  it('refuses server-only fields instead of ignoring them', () => {
    for (const extra of [
      { plan: 'pro' },
      { status: 'active' },
      { country: 'AE' },
      { termsVersionAccepted: 'v1' },
      { termsAcceptedAt: '2026-01-01T00:00:00Z' },
      { slug: 'mine' },
    ]) {
      expect(createOrganizationSchema.safeParse({ name: 'A', ...extra }).success).toBe(false);
      expect(updateOrganizationSchema.safeParse({ name: 'A', ...extra }).success).toBe(false);
    }
  });

  it('pages members with a default and capped limit', () => {
    expect(listMembersQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listMembersQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(listMembersQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listMembersQuerySchema.safeParse({ cursor: 'nope' }).success).toBe(false);
  });
});

describe('invitation DTO', () => {
  it('normalises the address and accepts the invitable roles', () => {
    expect(createInvitationSchema.parse({ email: ' Rana@Example.COM ', role: 'staff' })).toEqual({
      email: 'rana@example.com',
      role: 'staff',
    });
    for (const role of ['manager', 'staff', 'kitchen']) {
      expect(createInvitationSchema.safeParse({ email: 'a@b.co', role }).success).toBe(true);
    }
  });

  it('never accepts owner, Better Auth roles or a bad address', () => {
    for (const role of ['owner', 'member', 'admin', '', undefined]) {
      expect(createInvitationSchema.safeParse({ email: 'a@b.co', role }).success).toBe(false);
    }
    expect(createInvitationSchema.safeParse({ email: 'not-an-email', role: 'staff' }).success).toBe(
      false,
    );
    expect(
      createInvitationSchema.safeParse({ email: 'a@b.co', role: 'staff', organizationId: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('restaurant DTOs', () => {
  it('accepts a localised name and a lower-case slug', () => {
    expect(
      createRestaurantSchema.parse({
        name: { en: ' Beit Tayta ', ar: 'بيت تيتا' },
        slug: ' Beit-Tayta ',
      }),
    ).toEqual({ name: { en: 'Beit Tayta', ar: 'بيت تيتا' }, slug: 'beit-tayta' });
  });

  it('refuses bad slugs, empty names and extra fields', () => {
    for (const slug of ['ab', 'x'.repeat(49), 'beit tayta', 'بيت', 'a_b', '']) {
      expect(createRestaurantSchema.safeParse({ name: { en: 'A' }, slug }).success, slug).toBe(
        false,
      );
    }
    for (const name of [{}, { en: '' }, { eng: 'A' }, 'Beit']) {
      expect(createRestaurantSchema.safeParse({ name, slug: 'abc' }).success).toBe(false);
    }
    expect(
      createRestaurantSchema.safeParse({ name: { en: 'A' }, slug: 'abc', status: 'live' }).success,
    ).toBe(false);
    expect(
      createRestaurantSchema.safeParse({ name: { en: 'A' }, slug: 'abc', organizationId: 'x' })
        .success,
    ).toBe(false);
  });

  it('pages with a UUID cursor and a bounded limit', () => {
    expect(listRestaurantsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listRestaurantsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listRestaurantsQuerySchema.safeParse({ cursor: 'nope' }).success).toBe(false);
  });
});
