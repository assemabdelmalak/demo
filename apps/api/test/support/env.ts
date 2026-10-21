import { readFileSync } from 'node:fs';
import { parseEnv as parseDotenv } from 'node:util';

import { loadEnv } from '@radd/config/env';

import { type ApiEnv } from '../../src/config/env.module';

const example = parseDotenv(
  readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8'),
);

/** `.env.example` with test overrides: silent logs and the test's own service URLs. */
export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadEnv('api', {
    ...example,
    NODE_ENV: 'test',
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}
