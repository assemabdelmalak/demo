import { sql } from 'drizzle-orm';

import { isUuid } from '@radd/shared';

import { type DbExecutor } from './client.js';

/**
 * The organisation that owns a live (not deleted) restaurant, before any tenant context exists:
 * the API's guard resolves `/restaurants/:rid` with it, then checks membership of that
 * organisation. `restaurant_org()` is a narrow SECURITY DEFINER function (ADR-022) that returns
 * the ID only. Undefined when there is no such restaurant.
 */
export async function findRestaurantOrganization(
  db: DbExecutor,
  restaurantId: string,
): Promise<string | undefined> {
  if (!isUuid(restaurantId)) return undefined;
  const result = await db.execute<{ organization_id: string | null }>(
    sql`select restaurant_org(${restaurantId}::uuid) as organization_id`,
  );
  return result.rows[0]?.organization_id ?? undefined;
}
