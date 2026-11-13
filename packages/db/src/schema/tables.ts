import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { restaurants } from './restaurants.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { createdAt, id, localizedText, softDelete, timestamps } from '../columns.js';

export const diningAreas = pgTable(
  'dining_areas',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    name: localizedText('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('dining_areas', t),
    tenantFk('dining_areas_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('dining_areas_restaurant_id_idx').on(t.restaurantId),
  ],
);

export const diningTables = pgTable(
  'dining_tables',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    areaId: uuid('area_id'),
    /** "12", "T3", "Bar 2". */
    label: text('label').notNull(),
    seats: smallint('seats'),
    /** 12 random base58 characters (~70 bits); never sequential (SECURITY T2). */
    qrToken: text('qr_token').notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('dining_tables', t),
    tenantFk('dining_tables_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('dining_tables_area_fk', t, t.areaId, (): TenantParent => diningAreas),
    index('dining_tables_area_id_idx').on(t.areaId),
    uniqueIndex('dining_tables_restaurant_label_uq')
      .on(t.restaurantId, t.label)
      .where(sql`${t.deletedAt} is null`),
    check('dining_tables_seats_check', sql`${t.seats} > 0`),
    check('dining_tables_qr_token_check', sql`char_length(${t.qrToken}) = 12`),
  ],
);
