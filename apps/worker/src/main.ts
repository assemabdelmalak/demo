// Must stay the first import: Sentry has to instrument modules before they load.
// eslint-disable-next-line import-x/order
import { exitOnStartupFailure } from './instrument';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { loadEnvOrExit } from '@radd/config/env';

import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit('worker');
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // SIGTERM/SIGINT close the BullMQ workers, which wait for active jobs to finish (drain).
  app.enableShutdownHooks();
  await app.init();
  logger.log({ healthPort: env.WORKER_HEALTH_PORT }, 'worker started');
}

bootstrap().catch(exitOnStartupFailure);
