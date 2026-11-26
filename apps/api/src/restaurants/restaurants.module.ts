import { Module } from '@nestjs/common';

import { RestaurantsRepository } from '@radd/db';

import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

/** Restaurants (API §4 "Organisation and restaurants"); the full settings arrive in P2-T01. */
@Module({
  controllers: [RestaurantsController],
  // The repository takes its transaction from the tenant scope, so one instance serves all requests.
  providers: [
    RestaurantsService,
    { provide: RestaurantsRepository, useValue: new RestaurantsRepository() },
  ],
  exports: [RestaurantsRepository],
})
export class RestaurantsModule {}
