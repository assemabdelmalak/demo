import { type DynamicModule, Global, Module } from '@nestjs/common';

import { type Env } from '@radd/config/env';

export type WorkerEnv = Env<'worker'>;

export const WORKER_ENV = Symbol('WORKER_ENV');

@Global()
@Module({})
export class EnvModule {
  static register(env: WorkerEnv): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: WORKER_ENV, useValue: env }],
      exports: [WORKER_ENV],
    };
  }
}
