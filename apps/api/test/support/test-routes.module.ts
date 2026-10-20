import { setTimeout as delay } from 'node:timers/promises';

import { Body, Controller, Get, Module, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type FastifyReply } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DomainError, uuidv7 } from '@radd/shared';

import { Idempotent } from '../../src/idempotency/idempotent.decorator';

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
@Controller('__test')
class TestController {
  @Get('domain-error')
  domainError(): never {
    throw new DomainError('ITEM_UNAVAILABLE', { detail: 'Fattoush is sold out today' });
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

@Module({ controllers: [TestController] })
export class TestRoutesModule {}
