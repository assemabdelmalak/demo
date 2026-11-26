import { describe, expect, it } from 'vitest';

import { ALLERGEN_CODES, isUuidV7 } from '@radd/shared';

import {
  SEED_CATEGORIES,
  SEED_DISHES,
  SEED_GROUPS,
  SEED_MEMBERS,
  SEED_RESTAURANT,
  SEED_SESSIONS,
} from './data.js';
import { base32Encode, SEED_EPOCH, seedId, seedQrToken, seedTotpSecret } from './ids.js';
import {
  allergenStatuses,
  buildSessionRows,
  buildTenantRows,
  SEED_CONFIRMED_AT,
  SEED_IDS,
  seedIds,
} from './rows.js';

const SECRET = 'a test secret that is long enough to look real';

/**
 * docs/SEED_DATA.md "Dishes", restated by hand so an edit to data.ts that drifts from the spec
 * fails here. C = contains, M = may contain, U = unknown; every other allergen is free on a
 * confirmed dish and unknown on an unconfirmed one. Later safety tests and AI evals rely on it.
 */
const SPEC: Record<string, { confirmed: boolean; listed: Record<string, 'C' | 'M' | 'U'> }> = {
  hummus: { confirmed: true, listed: { sesame: 'C' } },
  moutabal: { confirmed: true, listed: { sesame: 'C' } },
  labneh: { confirmed: true, listed: { milk: 'C' } },
  'vine-leaves': { confirmed: false, listed: {} },
  muhammara: { confirmed: true, listed: { tree_nuts: 'C', gluten: 'C', sesame: 'M' } },
  'batata-harra': { confirmed: true, listed: { gluten: 'M' } },
  'fried-kibbeh': { confirmed: true, listed: { gluten: 'C', tree_nuts: 'C' } },
  falafel: { confirmed: true, listed: { sesame: 'C', gluten: 'M' } },
  sujuk: { confirmed: false, listed: {} },
  'grilled-halloumi': { confirmed: true, listed: { milk: 'C' } },
  'fatteh-hummus': {
    confirmed: true,
    listed: { gluten: 'C', milk: 'C', tree_nuts: 'C', sesame: 'C' },
  },
  fattoush: { confirmed: true, listed: { gluten: 'C' } },
  tabbouleh: { confirmed: true, listed: { gluten: 'C' } },
  'shish-taouk': { confirmed: false, listed: { milk: 'C', eggs: 'U' } },
  kafta: { confirmed: true, listed: { mustard: 'U' } },
  'mixed-grill': { confirmed: true, listed: { milk: 'M' } },
  'spicy-fish': { confirmed: true, listed: { fish: 'C', sesame: 'C', tree_nuts: 'C' } },
  'zaatar-manoushe': { confirmed: true, listed: { gluten: 'C', sesame: 'C' } },
  'cheese-manoushe': { confirmed: true, listed: { gluten: 'C', milk: 'C', sesame: 'M' } },
  'lahm-bi-ajeen': { confirmed: false, listed: {} },
  knefeh: { confirmed: true, listed: { gluten: 'C', milk: 'C', tree_nuts: 'C', sesame: 'C' } },
  mouhalabieh: { confirmed: true, listed: { milk: 'C', tree_nuts: 'C' } },
  atayef: { confirmed: true, listed: { gluten: 'C', milk: 'C', tree_nuts: 'C' } },
  lemonade: { confirmed: true, listed: {} },
  jallab: { confirmed: true, listed: { tree_nuts: 'C', sulphites: 'M' } },
  ayran: { confirmed: true, listed: { milk: 'C' } },
  arak: { confirmed: true, listed: { sulphites: 'U' } },
  'lebanese-coffee': { confirmed: true, listed: {} },
};

const CODE = { C: 'contains', M: 'may_contain', U: 'unknown' } as const;

describe('Beit Tayta seed data (SEED_DATA)', () => {
  it('has the 28 dishes of the spec in 7 categories, each with a known category', () => {
    expect(SEED_DISHES.map((dish) => dish.key)).toEqual(Object.keys(SPEC));
    expect(SEED_CATEGORIES).toHaveLength(7);
    const categories = new Set(SEED_CATEGORIES.map((category) => category.key));
    for (const dish of SEED_DISHES) expect(categories.has(dish.category)).toBe(true);
  });

  it('gives every dish exactly the 14 allergen statuses SEED_DATA lists', () => {
    for (const dish of SEED_DISHES) {
      const spec = SPEC[dish.key];
      if (!spec) throw new Error(`no spec for ${dish.key}`);
      expect(dish.confirmed, dish.key).toBe(spec.confirmed);
      const expected = Object.fromEntries(
        ALLERGEN_CODES.map((code) => {
          const listed = spec.listed[code];
          return [code, listed ? CODE[listed] : spec.confirmed ? 'free' : 'unknown'];
        }),
      );
      expect(allergenStatuses(dish), dish.key).toEqual(expected);
    }
  });

  it('writes 14 rows per dish, and confirms all 14 or none (ALLERGEN_SAFETY §3)', () => {
    const rows = buildTenantRows(SECRET);
    expect(rows.menuItemAllergens).toHaveLength(28 * 14);
    for (const dish of SEED_DISHES) {
      const own = rows.menuItemAllergens.filter((row) => row.itemId === seedIds.dish(dish.key));
      expect(own.map((row) => row.allergen).sort()).toEqual([...ALLERGEN_CODES].sort());
      const item = rows.menuItems.find((row) => row.id === seedIds.dish(dish.key));
      if (dish.confirmed) {
        expect(own.every((row) => row.confirmedAt === SEED_CONFIRMED_AT)).toBe(true);
        expect(own.every((row) => row.confirmedByUserId === SEED_IDS.users.owner)).toBe(true);
        expect(item).toMatchObject({
          allergensConfirmedAt: SEED_CONFIRMED_AT,
          allergensConfirmedBy: SEED_IDS.users.owner,
          allergensNeedReview: false,
        });
      } else {
        expect(own.every((row) => row.confirmedAt === null)).toBe(true);
        expect(own.every((row) => row.confirmedByUserId === null)).toBe(true);
        expect(item).toMatchObject({
          allergensConfirmedAt: null,
          allergensConfirmedBy: null,
          allergensNeedReview: true,
        });
      }
      // Suggestions never come from the seed; they are what an AI or import would propose.
      expect(
        own.every((row) => row.suggestedStatus === null && row.suggestionSource === null),
      ).toBe(true);
    }
  });

  it('leaves exactly the four dishes the safety tests rely on unconfirmed', () => {
    expect(SEED_DISHES.filter((dish) => !dish.confirmed).map((dish) => dish.key)).toEqual([
      'vine-leaves',
      'sujuk',
      'shish-taouk',
      'lahm-bi-ajeen',
    ]);
  });

  it('confirms option impacts only where SEED_DATA says so', () => {
    const rows = buildTenantRows(SECRET);
    const confirmed = Object.fromEntries(
      SEED_GROUPS.flatMap((group) =>
        group.options.map((option) => {
          const row = rows.modifierOptions.find((candidate) => candidate.name === option.name);
          return [`${group.key}/${option.key}`, row?.addsAllergensConfirmedAt !== null];
        }),
      ),
    );
    expect(confirmed).toEqual({
      'G1/chicken': true,
      'G1/halloumi': true,
      'G2/fries': false,
      'G2/salad': false,
      'G3/extra-garlic-sauce': false,
      'G4/extra-bread-basket': true,
      'G5/no-sugar': false,
      'G5/medium': false,
      'G5/sweet': false,
    });
    const impact = (key: string) =>
      SEED_GROUPS.flatMap((group) => group.options).find((option) => option.key === key)
        ?.addsAllergens;
    expect(impact('halloumi')).toEqual(['milk']);
    expect(impact('extra-garlic-sauce')).toEqual(['eggs']);
    expect(impact('extra-bread-basket')).toEqual(['gluten']);
  });

  it('uses the selection rules of SEED_DATA for each group', () => {
    const rules = Object.fromEntries(
      SEED_GROUPS.map((group) => [group.key, [group.minSelect, group.maxSelect]]),
    );
    expect(rules).toEqual({ G1: [0, 1], G2: [1, 1], G3: [0, 1], G4: [0, 1], G5: [1, 1] });
    // A group the diner must answer has exactly one default.
    for (const group of SEED_GROUPS.filter((candidate) => candidate.minSelect > 0)) {
      expect(group.options.filter((option) => option.isDefault)).toHaveLength(1);
    }
  });

  it('keeps every price an integer number of cents (CLAUDE §3.2)', () => {
    const rows = buildTenantRows(SECRET);
    const prices = [
      ...rows.menuItems.map((row) => row.basePriceMinor),
      ...rows.menuItemVariants.map((row) => row.priceMinor),
      ...rows.modifierOptions.map((row) => row.priceDeltaMinor ?? 0),
    ];
    expect(prices.every((price) => Number.isSafeInteger(price) && price >= 0)).toBe(true);
    expect(rows.menuItemVariants.map((row) => [row.name.en, row.priceMinor])).toEqual([
      ['For one', 1800],
      ['For two', 3400],
    ]);
  });

  it('marks only the fattoush bread as removable', () => {
    const rows = buildTenantRows(SECRET);
    expect(
      rows.menuItemIngredients
        .filter((row) => row.isRemovable)
        .map((row) => [row.itemId, row.name.en]),
    ).toEqual([[seedIds.dish('fattoush'), 'fried bread']]);
    expect(rows.menuItemIngredients.every((row) => row.name.en && row.name.ar)).toBe(true);
  });

  it('sets up tables 1–8 indoors for 4 and 9–12 on the terrace for 6', () => {
    const rows = buildTenantRows(SECRET);
    expect(rows.diningTables.map((row) => [row.label, row.seats, row.areaId])).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), 4, seedIds.area('indoor')]),
      ...[9, 10, 11, 12].map((n) => [String(n), 6, seedIds.area('terrace')]),
    ]);
    expect(SEED_RESTAURANT).toMatchObject({
      defaultLocale: 'en',
      enabledLocales: ['en', 'ar', 'fr'],
      lbpRate: 89_500,
      lbpRoundingStep: 5_000,
      taxRateBps: 1_100,
      serviceChargeBps: 1_000,
      orderingMode: 'diner_with_approval',
    });
    expect(SEED_MEMBERS.map((member) => [member.role, member.email, member.pin])).toEqual([
      ['owner', 'owner@beit-tayta.test', undefined],
      ['manager', 'manager@beit-tayta.test', undefined],
      ['staff', 'staff@beit-tayta.test', '1234'],
      ['kitchen', 'kitchen@beit-tayta.test', undefined],
    ]);
  });

  it('builds the same rows every time, with unique IDs', () => {
    const a = buildTenantRows(SECRET);
    expect(buildTenantRows(SECRET)).toEqual(a);
    const ids = Object.values(a).flatMap((rows: { id?: string }[]) =>
      rows.flatMap((row) => (row.id ? [row.id] : [])),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isUuidV7)).toBe(true);
  });
});

describe('demo sessions (--with-session)', () => {
  it('reproduces the worked example of GROUP_ORDERING §7.5 on table 5', () => {
    const rows = buildSessionRows();
    const table5 = seedIds.session('table-5');
    const items = rows.sessionItems.filter((row) => row.sessionId === table5);
    // S = 4950 in the worked example.
    expect(items.reduce((sum, row) => sum + row.lineTotalMinor, 0)).toBe(4950);
    expect(items.every((row) => row.status === 'accepted')).toBe(true);
    const hummus = items.find((row) => row.menuItemId === seedIds.dish('hummus'));
    expect(rows.sessionItemShares.filter((row) => row.sessionItemId === hummus?.id)).toHaveLength(
      3,
    );
    const round = rows.orderRounds.find((row) => row.sessionId === table5);
    expect(round).toMatchObject({ number: 1, status: 'accepted' });
    // Required groups are answered: the taouk and the grill come with fries.
    const taouk = items.find((row) => row.menuItemId === seedIds.dish('shish-taouk'));
    expect(taouk?.optionsSnapshot?.map((option) => option.name.en)).toEqual(['Fries']);
  });

  it('leaves table 9 waiting for staff approval', () => {
    const rows = buildSessionRows();
    const table9 = seedIds.session('table-9');
    expect(rows.orderRounds.find((row) => row.sessionId === table9)).toMatchObject({
      status: 'pending_approval',
      decidedByUserId: null,
      decidedAt: null,
    });
    expect(
      rows.sessionItems
        .filter((row) => row.sessionId === table9)
        .every((row) => row.status === 'pending_approval'),
    ).toBe(true);
    expect(SEED_SESSIONS.map((session) => session.table)).toEqual([5, 9]);
  });

  it('gives every session one host and one device per participant', () => {
    const rows = buildSessionRows();
    for (const session of rows.tableSessions) {
      const people = rows.sessionParticipants.filter((row) => row.sessionId === session.id);
      expect(people.filter((row) => row.role === 'host')).toHaveLength(1);
      expect(rows.hosts.find((row) => row.sessionId === session.id)?.hostParticipantId).toBe(
        people.find((row) => row.role === 'host')?.id,
      );
    }
    expect(new Set(rows.dinerDevices.map((row) => row.id)).size).toBe(
      rows.sessionParticipants.length,
    );
  });
});

describe('seed IDs and secrets', () => {
  it('derives stable UUIDv7 IDs that differ by kind and key', () => {
    expect(seedId('menu-item', 'hummus')).toBe(seedId('menu-item', 'hummus'));
    expect(seedId('menu-item', 'hummus')).not.toBe(seedId('menu-item', 'moutabal'));
    expect(seedId('menu-item', 'hummus')).not.toBe(seedId('menu-category', 'hummus'));
    expect(isUuidV7(seedId('menu-item', 'hummus'))).toBe(true);
    // The UUIDv7 timestamp is the seed epoch.
    const hex = seedId('menu-item', 'hummus').replaceAll('-', '').slice(0, 12);
    expect(Number.parseInt(hex, 16)).toBe(SEED_EPOCH.getTime());
  });

  it('makes QR tokens of 12 base58 characters that depend on the secret', () => {
    const token = seedQrToken(SECRET, '5');
    expect(token).toMatch(/^[1-9A-HJ-NP-Za-km-z]{12}$/);
    expect(seedQrToken(SECRET, '5')).toBe(token);
    expect(seedQrToken(SECRET, '6')).not.toBe(token);
    expect(seedQrToken(`${SECRET}!`, '5')).not.toBe(token);
  });

  it("derives the admin's TOTP secret in Better Auth's shape, per environment", () => {
    expect(seedTotpSecret(SECRET)).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(seedTotpSecret(SECRET)).toBe(seedTotpSecret(SECRET));
    expect(seedTotpSecret(`${SECRET}!`)).not.toBe(seedTotpSecret(SECRET));
  });

  it('encodes base32 as RFC 4648 does', () => {
    // RFC 4648 §10 test vectors, without padding.
    expect(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'].map(base32Encode)).toEqual([
      '',
      'MY',
      'MZXQ',
      'MZXW6',
      'MZXW6YQ',
      'MZXW6YTB',
      'MZXW6YTBOI',
    ]);
  });
});
