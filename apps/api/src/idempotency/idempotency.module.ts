import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { IDEMPOTENCY_OPTIONS, IdempotencyInterceptor } from './idempotency.interceptor';
import { DEFAULT_IDEMPOTENCY_OPTIONS, type IdempotencyOptions } from './idempotency.store';

@Module({})
export class IdempotencyModule {
  static register(options: Partial<IdempotencyOptions> = {}): DynamicModule {
    return {
      module: IdempotencyModule,
      providers: [
        { provide: IDEMPOTENCY_OPTIONS, useValue: { ...DEFAULT_IDEMPOTENCY_OPTIONS, ...options } },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    };
  }
}
