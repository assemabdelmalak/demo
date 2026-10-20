// Must stay the first import: Sentry has to instrument modules before they load.
// eslint-disable-next-line import-x/order
import { exitOnStartupFailure } from './instrument';
import 'reflect-metadata';

import { loadEnvOrExit } from '@radd/config/env';

import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit('api');
  const app = await createApp(env);
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
}

bootstrap().catch(exitOnStartupFailure);
