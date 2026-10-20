import { readFileSync } from 'node:fs';
import { parseEnv as parseDotenv } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AppName,
  EnvValidationError,
  envSchemas,
  loadEnv,
  loadEnvOrExit,
  loadPublicEnv,
  parseEnv,
  publicEnvSchemas,
} from './index.js';

const example = parseDotenv(
  readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8'),
);
const apps = Object.keys(envSchemas) as AppName[];
const REAL_SECRET = 'x'.repeat(48);

function issuesFor(app: AppName, source: Record<string, string | undefined>) {
  const result = parseEnv(app, source);
  if (result.ok) throw new Error(`expected ${app} env to be invalid`);
  return result.issues;
}

function schemaKeys(app: AppName): string[] {
  // superRefine wraps the object for some apps; both expose the original shape via `.shape` or `._zod.def`.
  const schema = envSchemas[app] as unknown as { shape?: Record<string, unknown> };
  if (schema.shape) return Object.keys(schema.shape);
  const inner = (envSchemas[app] as unknown as { _zod: { def: { in?: { shape: object } } } })._zod
    .def;
  return Object.keys(inner.in?.shape ?? {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('.env.example', () => {
  it.each(apps)('is a valid local environment for %s', (app) => {
    expect(parseEnv(app, example)).toMatchObject({ ok: true });
  });

  it('declares every variable an app schema reads (no drift)', () => {
    const declared = new Set(Object.keys(example));
    const missing = apps.flatMap((app) =>
      schemaKeys(app)
        .filter((key) => !declared.has(key))
        .map((key) => `${app}:${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('has no variable that no app reads (no drift)', () => {
    const read = new Set(apps.flatMap(schemaKeys));
    // Read by docker compose, not by the apps.
    const infraOnly = new Set(['DATABASE_URL_MIGRATOR', 'EVAL_BUDGET_USD']);
    const unread = Object.keys(example).filter((key) => !read.has(key) && !infraOnly.has(key));
    expect(unread).toEqual([]);
  });
});

describe('parseEnv', () => {
  it('lists every missing required variable, not just the first', () => {
    const { DATABASE_URL: _db, REDIS_URL: _redis, ...rest } = example;
    const issues = issuesFor('api', rest);
    expect(issues).toEqual(
      expect.arrayContaining([
        { key: 'DATABASE_URL', message: 'is required' },
        { key: 'REDIS_URL', message: 'is required' },
      ]),
    );
  });

  it('treats an empty value as missing', () => {
    expect(issuesFor('worker', { ...example, REDIS_URL: '' })).toEqual([
      { key: 'REDIS_URL', message: 'is required' },
    ]);
  });

  it('rejects malformed values with a reason', () => {
    const issues = issuesFor('api', {
      ...example,
      API_PORT: 'eighty',
      TRUSTED_ORIGINS: 'not a url',
    });
    expect(issues.map((issue) => issue.key).sort()).toEqual(['API_PORT', 'TRUSTED_ORIGINS.0']);
  });

  it('coerces numbers, booleans and comma lists', () => {
    const result = parseEnv('api', {
      ...example,
      DATABASE_POOL_MAX: '7',
      AI_ENABLED: 'false',
      TRUSTED_ORIGINS: 'http://a.test, http://b.test',
    });
    if (!result.ok) throw new Error('expected valid env');
    expect(result.env.DATABASE_POOL_MAX).toBe(7);
    expect(result.env.AI_ENABLED).toBe(false);
    expect(result.env.TRUSTED_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('requires at least one trusted origin', () => {
    expect(issuesFor('api', { ...example, TRUSTED_ORIGINS: ' , ' })[0]?.key).toBe(
      'TRUSTED_ORIGINS',
    );
  });
});

describe('secrets outside local development', () => {
  const secretKeys = [
    'BETTER_AUTH_SECRET',
    'PARTICIPANT_TOKEN_SECRET',
    'DEVICE_COOKIE_SECRET',
    'RECEIPT_TOKEN_SECRET',
    'DINER_REVALIDATE_SECRET',
    'ACTOR_HASH_SECRET',
  ];

  it.each(['staging', 'production'])('rejects the change-me placeholders in %s', (appEnv) => {
    const issues = issuesFor('api', { ...example, APP_ENV: appEnv });
    expect(issues.map((issue) => issue.key).sort()).toEqual([...secretKeys].sort());
  });

  it('rejects short secrets and never echoes the value', () => {
    const issues = issuesFor('diner', {
      ...example,
      APP_ENV: 'production',
      DINER_REVALIDATE_SECRET: 'hunter2-hunter2',
    });
    expect(issues).toHaveLength(1);
    expect(JSON.stringify(issues)).not.toContain('hunter2');
  });

  it('accepts long random secrets in production', () => {
    const secrets = Object.fromEntries(secretKeys.map((key) => [key, REAL_SECRET]));
    expect(parseEnv('api', { ...example, ...secrets, APP_ENV: 'production' })).toMatchObject({
      ok: true,
    });
  });

  it('accepts placeholders in local and test', () => {
    expect(parseEnv('api', { ...example, APP_ENV: 'test' })).toMatchObject({ ok: true });
  });
});

describe('loadEnv / loadEnvOrExit', () => {
  it('throws a readable error naming each problem', () => {
    const { REDIS_URL: _redis, ...rest } = example;
    expect(() => loadEnv('worker', rest)).toThrow(EnvValidationError);
    expect(() => loadEnv('worker', rest)).toThrow(/REDIS_URL: is required/);
  });

  it('prints the problems and exits with status 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { DATABASE_URL: _db, ...rest } = example;

    expect(() => loadEnvOrExit('worker', rest)).toThrow('process.exit');

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.mock.calls.join('')).toContain('DATABASE_URL: is required');
  });
});

describe('public (browser) env', () => {
  it.each(['diner', 'console'] as const)('exposes only browser-safe keys for %s', (app) => {
    const publicEnv = loadPublicEnv(app, { ...example, BETTER_AUTH_SECRET: REAL_SECRET });
    for (const key of Object.keys(publicEnv)) {
      expect(['APP_ENV', 'GIT_SHA'].includes(key) || key.startsWith('NEXT_PUBLIC_')).toBe(true);
    }
    expect(JSON.stringify(publicEnv)).not.toContain(REAL_SECRET);
  });

  it.each(['diner', 'console'] as const)('declares only browser-safe keys for %s', (app) => {
    for (const key of Object.keys(publicEnvSchemas[app].shape)) {
      expect(['APP_ENV', 'GIT_SHA'].includes(key) || key.startsWith('NEXT_PUBLIC_')).toBe(true);
    }
  });
});
