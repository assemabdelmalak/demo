import 'reflect-metadata';

import { loadEnvOrExit } from '@radd/config/env';

import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit('api');
  const app = await createApp(env);
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
}

void bootstrap();
