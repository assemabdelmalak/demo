import { type DynamicModule, Global, Module } from '@nestjs/common';

import { type Env } from '@radd/config/env';

export type ApiEnv = Env<'api'>;

/** Injection token for the validated API environment. */
export const API_ENV = Symbol('API_ENV');

@Global()
@Module({})
export class EnvModule {
  static register(env: ApiEnv): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
