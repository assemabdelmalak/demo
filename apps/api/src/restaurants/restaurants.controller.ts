import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { type MemberActor, type RestaurantList, type RestaurantView } from '@radd/shared';

import {
  CreateRestaurantDto,
  ListRestaurantsQueryDto,
  RestaurantDto,
  RestaurantListDto,
  RestaurantParamsDto,
} from './restaurants.dto';
import { RestaurantsService } from './restaurants.service';
import { CurrentActor, RequirePermission } from '../authz/access.decorators';
import { IDEMPOTENCY_HEADER, Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  /** A draft restaurant in the active organisation (owner or manager). */
  @Post()
  @RequirePermission('restaurant.create')
  @Idempotent()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'UUID' })
  @ApiCreatedResponse({ type: RestaurantDto })
  create(
    @CurrentActor() actor: MemberActor,
    @Body() body: CreateRestaurantDto,
  ): Promise<RestaurantView> {
    return this.service.create(actor, body);
  }

  /** The active organisation's restaurants (any member). */
  @Get()
  @RequirePermission('restaurant.read')
  @ApiOkResponse({ type: RestaurantListDto })
  list(
    @CurrentActor() actor: MemberActor,
    @Query() query: ListRestaurantsQueryDto,
  ): Promise<RestaurantList> {
    return this.service.list(actor, query);
  }

  /** One restaurant; 404 when it does not exist or belongs to an organisation the caller is not in. */
  @Get(':rid')
  @RequirePermission('restaurant.read')
  @ApiOkResponse({ type: RestaurantDto })
  read(
    @CurrentActor() actor: MemberActor,
    @Param() params: RestaurantParamsDto,
  ): Promise<RestaurantView> {
    return this.service.read(actor, params.rid);
  }
}
