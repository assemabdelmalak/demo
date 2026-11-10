import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { parseEnv as parseDotenv } from 'node:util';

import { loadEnv } from '@radd/config/env';

import { type WorkerEnv } from '../src/config/env.module';

const example = parseDotenv(
  readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8'),
);

export function testEnv(overrides: Record<string, string> = {}): WorkerEnv {
  return loadEnv('worker', {
    ...example,
    NODE_ENV: 'test',
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

/** A port nothing is listening on right now, for the probe server. */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address !== 'object' || !address) throw new Error('no port');
  return address.port;
}
