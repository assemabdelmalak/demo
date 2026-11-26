import { ALLERGEN_CODES, type AllergenCode, type AllergenStatus } from '@radd/shared';

import {
  type GroupKey,
  ingredientName,
  SEED_AREAS,
  SEED_CATEGORIES,
  SEED_DISHES,
  SEED_FAQ,
  SEED_GROUPS,
  SEED_ORGANIZATION,
  SEED_RESTAURANT,
  SEED_SESSIONS,
  SEED_STATIONS,
  SEED_SUPER_ADMIN,
  type SeedDish,
  type SeedSession,
} from './data.js';
import { SEED_EPOCH, seedId, seedQrToken } from './ids.js';

import type * as schema from '../schema/index.js';

/**
 * Pure translation of the seed data into table rows with deterministic IDs. Nothing here touches
 * the database or a secret except the QR tokens; hashing and encryption happen in `run.ts`, which
 * keeps whatever already matches so a second run changes nothing.
 */

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

/** The ID of each kind of seeded row, by its key in `data.ts`. */
export const seedIds = {
  user: (key: string) => seedId('user', key),
  member: (key: string) => seedId('member', key),
  station: (key: string) => seedId('kitchen-station', key),
  area: (key: string) => seedId('dining-area', key),
  table: (n: number) => seedId('dining-table', String(n)),
  category: (key: string) => seedId('menu-category', key),
  dish: (key: string) => seedId('menu-item', key),
  group: (key: GroupKey) => seedId('modifier-group', key),
  session: (key: string) => seedId('table-session', key),
} as const;

/** The IDs tests and later tasks name most often. */
export const SEED_IDS = {
  organization: seedId('organization', SEED_ORGANIZATION.slug),
  restaurant: seedId('restaurant', SEED_RESTAURANT.slug),
  users: {
    owner: seedIds.user('owner'),
    manager: seedIds.user('manager'),
    staff: seedIds.user('staff'),
    kitchen: seedIds.user('kitchen'),
    superAdmin: seedIds.user(SEED_SUPER_ADMIN.key),
  },
  members: {
    owner: seedIds.member('owner'),
    manager: seedIds.member('manager'),
    staff: seedIds.member('staff'),
    kitchen: seedIds.member('kitchen'),
  },
} as const;

export const optionId = (group: GroupKey, option: string) =>
  seedId('modifier-option', `${group}/${option}`);
export const variantId = (dish: string, variant: string) =>
  seedId('menu-item-variant', `${dish}/${variant}`);
export const accountId = (userKey: string) => seedId('account', userKey);
export const twoFactorId = (userKey: string) => seedId('two-factor', userKey);
export const participantId = (session: string, participant: string) =>
  seedId('session-participant', `${session}/${participant}`);
export const dinerDeviceId = (session: string, participant: string) =>
  seedId('diner-device', `${session}/${participant}`);

/** Owner confirmations carry a fixed time, so re-seeding never moves the "confirmed on" stamp. */
export const SEED_CONFIRMED_AT = SEED_EPOCH;

const tenant = {
  organizationId: SEED_IDS.organization,
  restaurantId: SEED_IDS.restaurant,
};

function lookup<T>(record: Record<string, T>, key: string, what: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`seed data names an unknown ${what}: ${key}`);
  return value;
}

function dishOf(key: string): SeedDish {
  const dish = SEED_DISHES.find((candidate) => candidate.key === key);
  if (!dish) throw new Error(`seed data names an unknown dish: ${key}`);
  return dish;
}

/** The 14 statuses of a dish: what SEED_DATA lists, the rest `free` if confirmed, else `unknown`. */
export function allergenStatuses(dish: SeedDish): Record<AllergenCode, AllergenStatus> {
  const rest: AllergenStatus = dish.confirmed ? 'free' : 'unknown';
  return Object.fromEntries(
    ALLERGEN_CODES.map((code) => [code, dish.allergens[code] ?? rest]),
  ) as Record<AllergenCode, AllergenStatus>;
}

export interface TenantRows {
  restaurants: Insert<typeof schema.restaurants>[];
  exchangeRateHistory: Insert<typeof schema.exchangeRateHistory>[];
  restaurantFaq: Insert<typeof schema.restaurantFaq>[];
  kitchenStations: Insert<typeof schema.kitchenStations>[];
  diningAreas: Insert<typeof schema.diningAreas>[];
  diningTables: Insert<typeof schema.diningTables>[];
  modifierGroups: Insert<typeof schema.modifierGroups>[];
  modifierOptions: Insert<typeof schema.modifierOptions>[];
  menuCategories: Insert<typeof schema.menuCategories>[];
  menuItems: Insert<typeof schema.menuItems>[];
  menuItemVariants: Insert<typeof schema.menuItemVariants>[];
  menuItemIngredients: Insert<typeof schema.menuItemIngredients>[];
  menuItemAllergens: Insert<typeof schema.menuItemAllergens>[];
  menuItemModifierGroups: Insert<typeof schema.menuItemModifierGroups>[];
}

/** `secret` keys the QR tokens (see `seedQrToken`). */
export function buildTenantRows(secret: string): TenantRows {
  const owner = SEED_IDS.users.owner;

  const restaurants: TenantRows['restaurants'] = [
    {
      id: SEED_IDS.restaurant,
      organizationId: SEED_IDS.organization,
      slug: SEED_RESTAURANT.slug,
      name: SEED_RESTAURANT.name,
      city: SEED_RESTAURANT.city,
      theme: { ...SEED_RESTAURANT.theme },
      timezone: 'Asia/Beirut',
      defaultLocale: SEED_RESTAURANT.defaultLocale,
      enabledLocales: [...SEED_RESTAURANT.enabledLocales],
      baseCurrency: SEED_RESTAURANT.baseCurrency,
      showSecondaryCurrency: SEED_RESTAURANT.showSecondaryCurrency,
      lbpRate: SEED_RESTAURANT.lbpRate,
      lbpRoundingStep: SEED_RESTAURANT.lbpRoundingStep,
      lbpRoundingMode: SEED_RESTAURANT.lbpRoundingMode,
      taxRateBps: SEED_RESTAURANT.taxRateBps,
      taxInclusive: SEED_RESTAURANT.taxInclusive,
      taxAppliesToService: SEED_RESTAURANT.taxAppliesToService,
      serviceChargeBps: SEED_RESTAURANT.serviceChargeBps,
      serviceChargeLabel: SEED_RESTAURANT.serviceChargeLabel,
      orderingMode: SEED_RESTAURANT.orderingMode,
      groupOrderingEnabled: SEED_RESTAURANT.groupOrderingEnabled,
      requireStaffApproval: true,
      lockNewJoinersDefault: false,
      aiAssistantEnabled: SEED_RESTAURANT.aiAssistantEnabled,
      aiSettings: structuredClone(SEED_RESTAURANT.aiSettings),
      openingHours: SEED_RESTAURANT.openingHours.map((hours) => ({ ...hours })),
      // Diners see nothing until a menu is published (P2-T08); ADR-033.
      status: 'draft',
      publishedMenuVersionId: null,
      deletedAt: null,
    },
  ];

  const exchangeRateHistory: TenantRows['exchangeRateHistory'] = [
    {
      id: seedId('exchange-rate', 'initial'),
      ...tenant,
      lbpRate: SEED_RESTAURANT.lbpRate,
      effectiveAt: SEED_EPOCH,
      setByUserId: owner,
    },
  ];

  const restaurantFaq: TenantRows['restaurantFaq'] = SEED_FAQ.map((faq, position) => ({
    id: seedId('faq', faq.key),
    ...tenant,
    question: faq.question,
    answer: faq.answer,
    position,
    isActive: true,
  }));

  const kitchenStations: TenantRows['kitchenStations'] = SEED_STATIONS.map((station, position) => ({
    id: seedIds.station(station.key),
    ...tenant,
    name: station.name,
    position,
  }));

  const diningAreas: TenantRows['diningAreas'] = SEED_AREAS.map((area, position) => ({
    id: seedIds.area(area.key),
    ...tenant,
    name: area.name,
    position,
    deletedAt: null,
  }));

  const diningTables: TenantRows['diningTables'] = SEED_AREAS.flatMap((area) =>
    area.tables.map((n) => ({
      id: seedIds.table(n),
      ...tenant,
      areaId: seedIds.area(area.key),
      label: String(n),
      seats: area.seats,
      qrToken: seedQrToken(secret, String(n)),
      isActive: true,
      position: n,
      deletedAt: null,
    })),
  );

  const modifierGroups: TenantRows['modifierGroups'] = SEED_GROUPS.map((group, position) => ({
    id: seedIds.group(group.key),
    ...tenant,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    position,
    deletedAt: null,
  }));

  const modifierOptions: TenantRows['modifierOptions'] = SEED_GROUPS.flatMap((group) =>
    group.options.map((option, position) => ({
      id: optionId(group.key, option.key),
      ...tenant,
      groupId: seedIds.group(group.key),
      name: option.name,
      priceDeltaMinor: option.priceDeltaMinor,
      isDefault: option.isDefault ?? false,
      isAvailable: true,
      position,
      addsAllergens: [...option.addsAllergens],
      addsAllergensConfirmedAt: option.impactConfirmed ? SEED_CONFIRMED_AT : null,
      deletedAt: null,
    })),
  );

  const stationOf = Object.fromEntries(
    SEED_CATEGORIES.map((category) => [category.key, seedIds.station(category.station)]),
  );
  const menuCategories: TenantRows['menuCategories'] = SEED_CATEGORIES.map(
    (category, position) => ({
      id: seedIds.category(category.key),
      ...tenant,
      name: category.name,
      description: null,
      position,
      isVisible: true,
      availabilitySchedule: null,
      kitchenStationId: lookup(stationOf, category.key, 'category'),
      translationMeta: {},
      deletedAt: null,
    }),
  );

  const positionInCategory = new Map<string, number>();
  const menuItems: TenantRows['menuItems'] = SEED_DISHES.map((dish) => {
    const position = positionInCategory.get(dish.category) ?? 0;
    positionInCategory.set(dish.category, position + 1);
    return {
      id: seedIds.dish(dish.key),
      ...tenant,
      categoryId: seedIds.category(dish.category),
      name: dish.name,
      description: null,
      position,
      basePriceMinor: dish.priceMinor,
      imageAssetId: null,
      isAvailable: true,
      isVisible: true,
      availabilitySchedule: null,
      spiceLevel: dish.spiceLevel ?? null,
      calories: null,
      dietTags: [...dish.dietTags],
      itemTags: [...dish.itemTags],
      prepMinutes: null,
      kitchenStationId: null,
      translationMeta: {},
      allergensConfirmedAt: dish.confirmed ? SEED_CONFIRMED_AT : null,
      allergensConfirmedBy: dish.confirmed ? owner : null,
      allergensNeedReview: !dish.confirmed,
      sourceImportJobId: null,
      contentVersion: 1,
      deletedAt: null,
    };
  });

  const menuItemVariants: TenantRows['menuItemVariants'] = SEED_DISHES.flatMap((dish) =>
    (dish.variants ?? []).map((variant, position) => ({
      id: variantId(dish.key, variant.key),
      ...tenant,
      itemId: seedIds.dish(dish.key),
      name: variant.name,
      priceMinor: variant.priceMinor,
      position,
      isDefault: variant.isDefault,
      deletedAt: null,
    })),
  );

  const menuItemIngredients: TenantRows['menuItemIngredients'] = SEED_DISHES.flatMap((dish) =>
    dish.ingredients.map((ingredient, position) => ({
      id: seedId('menu-item-ingredient', `${dish.key}/${ingredient.name}`),
      ...tenant,
      itemId: seedIds.dish(dish.key),
      name: ingredientName(ingredient.name),
      position,
      isKey: true,
      isRemovable: ingredient.removable ?? false,
    })),
  );

  const menuItemAllergens: TenantRows['menuItemAllergens'] = SEED_DISHES.flatMap((dish) => {
    const statuses = allergenStatuses(dish);
    return ALLERGEN_CODES.map((allergen) => ({
      itemId: seedIds.dish(dish.key),
      allergen,
      ...tenant,
      status: statuses[allergen],
      confirmedAt: dish.confirmed ? SEED_CONFIRMED_AT : null,
      confirmedByUserId: dish.confirmed ? owner : null,
      suggestedStatus: null,
      suggestionSource: null,
      suggestionReason: null,
      suggestionConfidence: null,
      notes: dish.allergenNotes?.[allergen] ?? null,
    }));
  });

  const menuItemModifierGroups: TenantRows['menuItemModifierGroups'] = SEED_DISHES.flatMap((dish) =>
    dish.groups.map((group, position) => ({
      itemId: seedIds.dish(dish.key),
      groupId: seedIds.group(group),
      ...tenant,
      position,
    })),
  );

  return {
    restaurants,
    exchangeRateHistory,
    restaurantFaq,
    kitchenStations,
    diningAreas,
    diningTables,
    modifierGroups,
    modifierOptions,
    menuCategories,
    menuItems,
    menuItemVariants,
    menuItemIngredients,
    menuItemAllergens,
    menuItemModifierGroups,
  };
}

export interface SessionRows {
  dinerDevices: Insert<typeof schema.dinerDevices>[];
  tableSessions: Insert<typeof schema.tableSessions>[];
  sessionParticipants: Insert<typeof schema.sessionParticipants>[];
  /** Set after the participants exist: the host reference points back at them. */
  hosts: { sessionId: string; hostParticipantId: string }[];
  orderRounds: Insert<typeof schema.orderRounds>[];
  sessionItems: Insert<typeof schema.sessionItems>[];
  sessionItemShares: Insert<typeof schema.sessionItemShares>[];
}

function priceOf(dish: SeedDish, variant: string | undefined): number {
  if (!variant) return dish.priceMinor;
  const found = dish.variants?.find((candidate) => candidate.key === variant);
  if (!found) throw new Error(`seed data names an unknown variant: ${dish.key}/${variant}`);
  return found.priceMinor;
}

function optionOf(token: string) {
  const [groupKey, optionKey] = token.split('/') as [GroupKey, string];
  const group = SEED_GROUPS.find((candidate) => candidate.key === groupKey);
  const option = group?.options.find((candidate) => candidate.key === optionKey);
  if (!group || !option) throw new Error(`seed data names an unknown option: ${token}`);
  return { group, option };
}

function sessionRows(session: SeedSession, rows: SessionRows): void {
  const sessionId = seedIds.session(session.key);
  const participant = (key: string) => participantId(session.key, key);
  const roundId = seedId('order-round', `${session.key}/1`);
  const accepted = session.round.status === 'accepted';
  const host = session.participants.find((candidate) => candidate.host);
  if (!host) throw new Error(`seed session ${session.key} has no host`);

  rows.tableSessions.push({
    id: sessionId,
    ...tenant,
    tableId: seedIds.table(session.table),
    status: 'open',
    // One bump per join, per item and for the round being sent (and decided).
    version: 1 + session.participants.length + session.items.length + (accepted ? 2 : 1),
    isLocked: false,
    orderingModeSnapshot: SEED_RESTAURANT.orderingMode,
    lbpRateSnapshot: null,
    splitMode: 'by_person',
    billRequestedAt: null,
    closedAt: null,
    closedByUserId: null,
    closeReason: null,
    forceClosed: false,
    feedback: null,
    mergedIntoSessionId: null,
  });
  rows.hosts.push({ sessionId, hostParticipantId: participant(host.key) });

  for (const person of session.participants) {
    rows.dinerDevices.push({
      id: dinerDeviceId(session.key, person.key),
      preferredLocale: person.locale,
      lastDisplayName: person.displayName,
      uaHash: null,
    });
    rows.sessionParticipants.push({
      id: participant(person.key),
      ...tenant,
      sessionId,
      deviceId: dinerDeviceId(session.key, person.key),
      displayName: person.displayName,
      color: person.color,
      emoji: null,
      role: person.host ? 'host' : 'guest',
      status: 'active',
      isReady: true,
      locale: person.locale,
      createdByStaffUserId: null,
      leftAt: null,
    });
  }

  rows.orderRounds.push({
    id: roundId,
    ...tenant,
    sessionId,
    number: 1,
    status: session.round.status,
    submittedByParticipantId: participant(session.round.submittedBy),
    submittedByUserId: null,
    decidedByUserId: accepted ? SEED_IDS.users.staff : null,
    // Set once on insert (`run.ts` keeps it), so a re-run does not move it.
    decidedAt: accepted ? new Date() : null,
    rejectionReason: null,
    kitchenNote: null,
  });

  for (const item of session.items) {
    const dish = dishOf(item.dish);
    const options = (item.options ?? []).map(optionOf);
    const unitPriceMinor = priceOf(dish, item.variant);
    const optionsPriceMinor = options.reduce((sum, { option }) => sum + option.priceDeltaMinor, 0);
    const itemId = seedId('session-item', `${session.key}/${item.key}`);
    rows.sessionItems.push({
      id: itemId,
      ...tenant,
      sessionId,
      participantId: participant(item.participant),
      roundId,
      menuItemId: seedIds.dish(item.dish),
      variantId: item.variant ? variantId(dish.key, item.variant) : null,
      quantity: item.quantity,
      optionIds: options.map(({ group, option }) => optionId(group.key, option.key)),
      removedIngredientIds: [],
      note: null,
      unitPriceMinor,
      optionsPriceMinor,
      lineTotalMinor: (unitPriceMinor + optionsPriceMinor) * item.quantity,
      nameSnapshot: dish.name,
      optionsSnapshot: options.map(({ group, option }) => ({
        optionId: optionId(group.key, option.key),
        groupId: seedIds.group(group.key),
        name: option.name,
        priceDeltaMinor: option.priceDeltaMinor,
      })),
      status: accepted ? 'accepted' : 'pending_approval',
      voidedReason: null,
      voidedByUserId: null,
      addedByUserId: null,
      clientMutationId: null,
    });
    for (const sharer of item.sharedBy ?? []) {
      rows.sessionItemShares.push({
        sessionItemId: itemId,
        participantId: participant(sharer),
        weight: 1,
        ...tenant,
      });
    }
  }
}

export function buildSessionRows(): SessionRows {
  const rows: SessionRows = {
    dinerDevices: [],
    tableSessions: [],
    sessionParticipants: [],
    hosts: [],
    orderRounds: [],
    sessionItems: [],
    sessionItemShares: [],
  };
  for (const session of SEED_SESSIONS) sessionRows(session, rows);
  return rows;
}
