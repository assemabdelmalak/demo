import { randomBytes } from 'node:crypto';

import { type DbExecutor } from '../client.js';
import {
  createCategory,
  createDinerDevice,
  createDiningTable,
  createMenuItem,
  createOrganization,
  createParticipant,
  createRestaurant,
  createSessionItem,
  createTableSession,
  createUser,
} from './factories.js';
import * as schema from '../schema/index.js';

function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('insert returned no row');
  return row;
}

export interface TenantFixture {
  organizationId: string;
  restaurantId: string;
  userId: string;
  menuVersionId: string;
}

/**
 * One organisation with at least one row in EVERY tenant table. The tenancy test discovers the
 * tenant tables from the catalog and fails if any of them has no row here, so a new table cannot
 * be added without extending this (ADR-022). Run it on a connection that may write any
 * organisation's rows (the admin role).
 */
export async function createTenantFixture(db: DbExecutor): Promise<TenantFixture> {
  const key = randomBytes(4).toString('hex');
  const user = await createUser(db);
  const organization = await createOrganization(db);
  const organizationId = organization.id;
  const restaurant = await createRestaurant(db, organizationId);
  const scope = { organizationId, restaurantId: restaurant.id };

  const asset = one(
    await db
      .insert(schema.assets)
      .values({
        organizationId,
        kind: 'image',
        bucket: 'radd-assets',
        storageKey: `fixtures/${key}.jpg`,
        mime: 'image/jpeg',
        bytes: 1024,
      })
      .returning(),
  );
  await db
    .insert(schema.staffDevices)
    .values({ ...scope, name: 'Bar tablet', tokenHash: `hash-${key}` });
  await db
    .insert(schema.exchangeRateHistory)
    .values({ ...scope, lbpRate: 89_500, effectiveAt: new Date() });
  await db
    .insert(schema.restaurantFaq)
    .values({ ...scope, question: { en: 'Parking?' }, answer: { en: 'Valet after 7 pm.' } });
  await db.insert(schema.glossaryTerms).values({ ...scope, term: { en: 'Toum', ar: 'ثوم' } });

  // Menu
  const station = one(
    await db
      .insert(schema.kitchenStations)
      .values({ ...scope, name: { en: 'Cold' } })
      .returning(),
  );
  const category = await createCategory(db, scope, { kitchenStationId: station.id });
  const item = await createMenuItem(
    db,
    { ...scope, categoryId: category.id },
    { imageAssetId: asset.id },
  );
  const variant = one(
    await db
      .insert(schema.menuItemVariants)
      .values({ ...scope, itemId: item.id, name: { en: 'For two' }, priceMinor: 3_400 })
      .returning(),
  );
  await db
    .insert(schema.menuItemIngredients)
    .values({ ...scope, itemId: item.id, name: { en: 'Sumac' } });
  await db
    .insert(schema.menuItemAllergens)
    .values({ ...scope, itemId: item.id, allergen: 'gluten' });
  const group = one(
    await db
      .insert(schema.modifierGroups)
      .values({ ...scope, name: { en: 'Add protein' } })
      .returning(),
  );
  await db
    .insert(schema.modifierOptions)
    .values({ ...scope, groupId: group.id, name: { en: 'Chicken' } });
  await db
    .insert(schema.menuItemModifierGroups)
    .values({ ...scope, itemId: item.id, groupId: group.id });
  const version = one(
    await db
      .insert(schema.menuVersions)
      .values({
        ...scope,
        version: 1,
        snapshot: { schema: 1 },
        snapshotHash: `sha256-${key}`,
        aiContextText: 'D1 Fattoush',
        stats: { items: 1 },
        publishedByUserId: user.id,
        publishedAt: new Date(),
      })
      .returning(),
  );

  // Tables and a session
  const area = one(
    await db
      .insert(schema.diningAreas)
      .values({ ...scope, name: { en: 'Indoor' } })
      .returning(),
  );
  const table = await createDiningTable(db, scope, { areaId: area.id });
  const session = await createTableSession(db, { ...scope, tableId: table.id });
  const device = await createDinerDevice(db);
  const participant = await createParticipant(
    db,
    { ...scope, sessionId: session.id },
    { deviceId: device.id },
  );
  const round = one(
    await db
      .insert(schema.orderRounds)
      .values({ ...scope, sessionId: session.id, number: 1, status: 'accepted' })
      .returning(),
  );
  const sessionItem = await createSessionItem(
    db,
    { ...scope, sessionId: session.id, participantId: participant.id, menuItemId: item.id },
    { roundId: round.id, variantId: variant.id, status: 'accepted' },
  );
  await db
    .insert(schema.sessionItemShares)
    .values({ ...scope, sessionItemId: sessionItem.id, participantId: participant.id });
  await db.insert(schema.waiterCalls).values({ ...scope, sessionId: session.id, type: 'water' });

  // Billing
  await db.insert(schema.discounts).values({
    ...scope,
    sessionId: session.id,
    scope: 'bill',
    type: 'percent',
    value: 1_000,
    reason: 'Regular guest',
    appliedByUserId: user.id,
  });
  await db.insert(schema.payments).values({
    ...scope,
    sessionId: session.id,
    method: 'cash_usd',
    amountMinor: 650,
    allocations: [{ participantId: participant.id, amountMinor: 650 }],
    recordedByUserId: user.id,
    recordedAt: new Date(),
  });
  await db.insert(schema.billSnapshots).values({
    ...scope,
    sessionId: session.id,
    data: { total: 650 },
    totalMinor: 650n,
    currency: 'USD',
    lbpRate: 89_500,
    closedAt: new Date(),
  });

  // AI and chat
  const importJob = one(
    await db
      .insert(schema.importJobs)
      .values({ ...scope, sourceAssetIds: [asset.id], options: { targetLocales: ['ar', 'en'] } })
      .returning(),
  );
  await db
    .insert(schema.importJobPages)
    .values({ ...scope, importJobId: importJob.id, assetId: asset.id, pageIndex: 0 });
  const conversation = one(
    await db
      .insert(schema.chatConversations)
      .values({ ...scope, deviceId: device.id, locale: 'en', menuVersionId: version.id })
      .returning(),
  );
  const message = one(
    await db
      .insert(schema.chatMessages)
      .values({ ...scope, conversationId: conversation.id, role: 'user', content: 'Is it vegan?' })
      .returning(),
  );
  await db
    .insert(schema.chatMessageLabels)
    .values({ ...scope, messageId: message.id, intent: 'diet', answerStatus: 'answered' });

  // Analytics
  await db.insert(schema.menuEvents).values({ ...scope, type: 'scan', occurredAt: new Date() });
  await db.insert(schema.dailyMetrics).values({ ...scope, day: '2026-11-01' });
  await db.insert(schema.dailyDishMetrics).values({ ...scope, day: '2026-11-01', dishId: item.id });
  await db.insert(schema.insightReports).values({
    ...scope,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-07',
    metrics: {},
    summary: {},
  });

  // Platform
  await db.insert(schema.subscriptions).values({
    organizationId,
    plan: 'pro',
    status: 'active',
    currentPeriodStart: '2026-11-01',
    currentPeriodEnd: '2027-11-01',
  });
  await db.insert(schema.subscriptionPayments).values({
    organizationId,
    amountMinor: 2_900,
    currency: 'USD',
    method: 'whish',
    periodStart: '2026-11-01',
    periodEnd: '2026-12-01',
    recordedByUserId: user.id,
  });
  await db.insert(schema.usageCounters).values({ organizationId, period: '2026-11' });
  await db
    .insert(schema.featureFlags)
    .values({ key: `fixture.${key}`, organizationId, enabled: true });
  await db.insert(schema.auditLogs).values({
    organizationId,
    restaurantId: restaurant.id,
    actorType: 'user',
    action: 'price.update',
  });
  await db.insert(schema.outboxEvents).values({
    organizationId,
    aggregateType: 'session',
    aggregateId: session.id,
    type: 'session.updated',
    payload: { sessionVersion: 1 },
    room: [`session:${session.id}`],
  });
  await db
    .insert(schema.notificationOptins)
    .values({ organizationId, userId: user.id, channel: 'email', address: user.email });

  return {
    organizationId,
    restaurantId: restaurant.id,
    userId: user.id,
    menuVersionId: version.id,
  };
}
