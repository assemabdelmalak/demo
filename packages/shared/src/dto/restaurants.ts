import { z } from 'zod';

import { RESTAURANT_STATUSES } from '../enums.js';
import { LOCALES } from '../i18n.js';
import { localizedTextSchema } from '../localized-text.js';

/** The restaurant's public handle in diner URLs (DATA_MODEL §3: `[a-z0-9-]{3,48}`). */
export const restaurantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,48}$/, 'Use 3–48 lower-case letters, digits or hyphens');

/**
 * `POST /v1/restaurants`: a draft restaurant in the active organisation. Everything else (settings,
 * currency, ordering mode) keeps its defaults until P2-T01's settings endpoints.
 */
export const createRestaurantSchema = z.strictObject({
  name: localizedTextSchema(100),
  slug: restaurantSlugSchema,
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;

/** Owner-written text as returned: any of the supported languages. */
const localizedTextViewSchema = z.partialRecord(z.enum(LOCALES), z.string());

export const restaurantSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  slug: z.string(),
  name: localizedTextViewSchema,
  status: z.enum(RESTAURANT_STATUSES),
  defaultLocale: z.enum(LOCALES),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
});
export type RestaurantView = z.infer<typeof restaurantSchema>;

/** Restaurants list query: cursor pagination (API §1). */
export const listRestaurantsQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListRestaurantsQuery = z.infer<typeof listRestaurantsQuerySchema>;

export const restaurantListSchema = z.object({
  items: z.array(restaurantSchema),
  nextCursor: z.uuid().nullable(),
});
export type RestaurantList = z.infer<typeof restaurantListSchema>;

/** `:rid` in console routes. */
export const restaurantParamsSchema = z.strictObject({ rid: z.uuid() });
