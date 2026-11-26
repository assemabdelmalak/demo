import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import { type LocalizedText } from '@radd/shared';

import { restaurants } from '../schema/restaurants.js';
import { BaseTenantRepository } from '../tenant.js';

export interface RestaurantRow {
  id: string;
  organizationId: string;
  slug: string;
  name: LocalizedText;
  status: (typeof restaurants.$inferSelect)['status'];
  defaultLocale: (typeof restaurants.$inferSelect)['defaultLocale'];
  timezone: string;
  createdAt: Date;
}

const columns = {
  id: restaurants.id,
  organizationId: restaurants.organizationId,
  slug: restaurants.slug,
  name: restaurants.name,
  status: restaurants.status,
  defaultLocale: restaurants.defaultLocale,
  timezone: restaurants.timezone,
  createdAt: restaurants.createdAt,
};

/**
 * Restaurants of the current tenant. Every query also names the organisation explicitly, so a
 * missing policy would still not leak rows; RLS is the backstop for a query that forgets.
 */
export class RestaurantsRepository extends BaseTenantRepository {
  /**
   * A draft restaurant with default settings. Undefined when the slug is taken by any restaurant,
   * in any organisation: the unique index answers before RLS, and nothing about the owner of the
   * slug is read.
   */
  async create(input: { name: LocalizedText; slug: string }): Promise<RestaurantRow | undefined> {
    const [row] = await this.tx
      .insert(restaurants)
      .values({ organizationId: this.organizationId, name: input.name, slug: input.slug })
      .onConflictDoNothing({ target: restaurants.slug })
      .returning(columns);
    return row;
  }

  async findById(restaurantId: string): Promise<RestaurantRow | undefined> {
    const [row] = await this.tx
      .select(columns)
      .from(restaurants)
      .where(
        and(
          eq(restaurants.organizationId, this.organizationId),
          eq(restaurants.id, restaurantId),
          isNull(restaurants.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /** One page in creation order (UUIDv7). `hasMore` says whether another page follows. */
  async list({
    cursor,
    limit,
  }: {
    cursor?: string | undefined;
    limit: number;
  }): Promise<{ items: RestaurantRow[]; hasMore: boolean }> {
    const rows = await this.tx
      .select(columns)
      .from(restaurants)
      .where(
        and(
          eq(restaurants.organizationId, this.organizationId),
          isNull(restaurants.deletedAt),
          cursor ? gt(restaurants.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(restaurants.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }
}
