import { setTimeout as delay } from 'node:timers/promises';

import { Body, Controller, Get, Module, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type FastifyReply } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { RestaurantsRepository } from '@radd/db';
import { DomainError, type MemberActor, uuidv7 } from '@radd/shared';

import { AuditService } from '../../src/audit/audit.service';
import { CurrentActor, Public, RequirePermission } from '../../src/authz/access.decorators';
import { RequestContext } from '../../src/authz/request-context';
import { Idempotent } from '../../src/idempotency/idempotent.decorator';

class ItemParams extends createZodDto(z.object({ id: z.string().min(1).max(100) })) {}

class OrderDto extends createZodDto(
  z.object({ item: z.string().min(1), qty: z.number().int().min(1).max(20) }),
) {}

/** Counts handler executions so tests can prove a replay did not run the handler again. */
export const calls = {
  orders: 0,
  soldOut: 0,
  flaky: 0,
  slow: 0,
  verySlow: 0,
  created: 0,
  degraded: 0,
};

/** Routes that exist only in tests; never registered by `main.ts`. */
@Public()
@Controller('__test')
class TestController {
  @Get('domain-error')
  domainError(): never {
    throw new DomainError('ITEM_UNAVAILABLE', { detail: 'Fattoush is sold out today' });
  }

  @Get('items/:id')
  item(@Param() params: ItemParams) {
    return { id: params.id };
  }

  /** Extensions named like reserved problem members must not change the response. */
  @Get('session-closed')
  sessionClosed(): never {
    throw new DomainError('SESSION_CLOSED', { extensions: { status: 'closed', sessionId: 's1' } });
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection string postgres://secret@db leaked');
  }

  @Post('orders')
  @Idempotent()
  createOrder(@Body() body: OrderDto) {
    calls.orders += 1;
    return { orderId: uuidv7(), item: body.item, qty: body.qty };
  }

  @Post('slow')
  @Idempotent()
  async slow(@Body() body: OrderDto) {
    calls.slow += 1;
    await delay(400);
    return { done: true, item: body.item, qty: body.qty };
  }

  /** Outlives a short in-flight TTL; the heartbeat must keep the key locked. */
  @Post('very-slow')
  @Idempotent()
  async verySlow(@Body() body: OrderDto) {
    calls.verySlow += 1;
    await delay(1_000);
    return { done: true, item: body.item, qty: body.qty };
  }

  @Post('created')
  @Idempotent()
  created(@Body() body: OrderDto, @Res({ passthrough: true }) reply: FastifyReply) {
    calls.created += 1;
    const orderId = uuidv7();
    void reply.header('location', `/v1/orders/${orderId}`);
    return { orderId, item: body.item };
  }

  /** A handler that reports a transient failure without throwing. */
  @Post('degraded')
  @Idempotent()
  degraded(@Body() _body: OrderDto, @Res({ passthrough: true }) reply: FastifyReply) {
    calls.degraded += 1;
    void reply.status(503);
    return { retry: true };
  }

  @Post('sold-out')
  @Idempotent()
  soldOut(@Body() _body: OrderDto): never {
    calls.soldOut += 1;
    throw new DomainError('ITEM_UNAVAILABLE');
  }

  @Post('flaky')
  @Idempotent()
  flaky(@Body() _body: OrderDto): never {
    calls.flaky += 1;
    throw new Error('database unavailable');
  }

  @Get('limited')
  @Throttle({ default: { limit: 3, ttl: 2_000 } })
  limited() {
    return { ok: true };
  }

  @Get('ping')
  ping() {
    return { ok: true };
  }

  /** A limit of 0 switches an endpoint off; it must block, not fail open. */
  @Get('off')
  @Throttle({ default: { limit: 0, ttl: 1_000 } })
  off() {
    return { ok: true };
  }
}

class SlugBody extends createZodDto(z.object({ slug: z.string().min(3).max(48) })) {}
class RestaurantParam extends createZodDto(z.object({ rid: z.uuid() })) {}

/** Declares no access policy: the default-deny guard must refuse every route here. */
@Controller('__test/undeclared')
class UndeclaredController {
  @Get()
  open() {
    return { leaked: true };
  }

  /** Refused requests must still count against rate limits. */
  @Get('limited')
  @Throttle({ default: { limit: 3, ttl: 2_000 } })
  limited() {
    return { leaked: true };
  }
}

/** Tenant-scoped routes that expose the plumbing: the context and the transaction. */
@Controller('__test/tenant')
class TenantTestController {
  constructor(
    private readonly context: RequestContext,
    private readonly restaurants: RestaurantsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Writes a restaurant in the request transaction, then fails: the write must roll back. */
  @Post('write-then-throw')
  @RequirePermission('restaurant.create')
  async writeThenThrow(@Body() body: SlugBody): Promise<never> {
    const row = await this.restaurants.create({ name: { en: 'Rolled back' }, slug: body.slug });
    throw new DomainError('CONFLICT', { detail: `wrote ${row?.id ?? 'nothing'}, then failed` });
  }

  /** Writes a restaurant and its audit entry, then fails: both must roll back together. */
  @Post('audit-then-throw')
  @RequirePermission('restaurant.create')
  async auditThenThrow(@Body() body: SlugBody): Promise<never> {
    const row = await this.restaurants.create({ name: { en: 'Rolled back' }, slug: body.slug });
    await this.audit.record({
      action: 'test.rolled_back',
      entityType: 'restaurant',
      entityId: row?.id ?? body.slug,
      after: { slug: body.slug },
    });
    throw new DomainError('CONFLICT', { detail: 'audited, then failed' });
  }

  /** Audits a state full of values that must never be stored (SECURITY §2 "Never log"). */
  @Post('audit-sensitive')
  @RequirePermission('restaurant.create')
  async auditSensitive(): Promise<{ id: string }> {
    const id = uuidv7();
    await this.audit.record({
      action: 'test.sensitive',
      entityType: 'payment',
      entityId: id,
      after: {
        amountMinor: 1500,
        externalReference: 'WHISH-55501234',
        pin: 'pin-zqx-7731',
        session: { token: 'secret-session-token' },
        clientIp: this.context.clientIp,
        note: this.context.clientIp,
      },
    });
    return { id };
  }

  /** What services see through `RequestContext`. */
  @Get('context')
  @RequirePermission('restaurant.read')
  current(@CurrentActor() actor: MemberActor) {
    return {
      actor,
      organizationId: this.context.organizationId ?? null,
      restaurantId: this.context.restaurantId ?? null,
      requestId: this.context.requestId ?? null,
      sameActor: this.context.actor.userId === actor.userId,
    };
  }

  /** The tenant of a restaurant-scoped route is the restaurant's organisation. */
  @Get('restaurants/:rid')
  @RequirePermission('restaurant.read')
  restaurant(@Param() params: RestaurantParam) {
    return {
      organizationId: this.context.organizationId ?? null,
      restaurantId: this.context.restaurantId ?? null,
      rid: params.rid,
    };
  }
}

@Module({
  controllers: [TestController, UndeclaredController, TenantTestController],
  providers: [{ provide: RestaurantsRepository, useValue: new RestaurantsRepository() }],
})
export class TestRoutesModule {}
