import { Injectable } from '@nestjs/common';

import { type RestaurantRow, RestaurantsRepository } from '@radd/db';
import {
  assertCan,
  type CreateRestaurantInput,
  DomainError,
  type ListRestaurantsQuery,
  type MemberActor,
  type RestaurantList,
  type RestaurantView,
  restaurantSchema,
} from '@radd/shared';

import { AuditService } from '../audit/audit.service';

export function toRestaurantView(row: RestaurantRow): RestaurantView {
  return restaurantSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

/**
 * The minimal restaurant endpoints that prove the tenant plumbing (P1-T05). Full settings are
 * P2-T01. Every method runs inside the request's tenant transaction.
 */
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurants: RestaurantsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(actor: MemberActor, input: CreateRestaurantInput): Promise<RestaurantView> {
    assertCan(actor, 'restaurant.create');
    const row = await this.restaurants.create(input);
    // Slugs are global; whose restaurant holds it is not ours to say.
    if (!row) throw new DomainError('CONFLICT', { detail: 'This slug is already taken' });
    const view = toRestaurantView(row);
    await this.audit.record(
      { action: 'restaurant.create', entityType: 'restaurant', entityId: row.id, after: view },
      { restaurantId: row.id },
    );
    return view;
  }

  async list(actor: MemberActor, query: ListRestaurantsQuery): Promise<RestaurantList> {
    assertCan(actor, 'restaurant.read');
    const { items, hasMore } = await this.restaurants.list(query);
    const last = items.at(-1);
    return {
      items: items.map(toRestaurantView),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async read(actor: MemberActor, restaurantId: string): Promise<RestaurantView> {
    assertCan(actor, 'restaurant.read');
    const row = await this.restaurants.findById(restaurantId);
    if (!row) throw new DomainError('NOT_FOUND', { detail: 'Restaurant not found' });
    return toRestaurantView(row);
  }
}
