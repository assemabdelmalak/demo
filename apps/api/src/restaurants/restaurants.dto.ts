import { createZodDto } from 'nestjs-zod';

import {
  createRestaurantSchema,
  listRestaurantsQuerySchema,
  restaurantListSchema,
  restaurantParamsSchema,
  restaurantSchema,
} from '@radd/shared';

// Nest wrappers around the shared schemas in packages/shared/src/dto (one schema per DTO).
export class CreateRestaurantDto extends createZodDto(createRestaurantSchema) {}
export class RestaurantDto extends createZodDto(restaurantSchema) {}
export class ListRestaurantsQueryDto extends createZodDto(listRestaurantsQuerySchema) {}
export class RestaurantListDto extends createZodDto(restaurantListSchema) {}
export class RestaurantParamsDto extends createZodDto(restaurantParamsSchema) {}
