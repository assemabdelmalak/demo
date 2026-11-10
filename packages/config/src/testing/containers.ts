import { readFileSync } from 'node:fs';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { ValkeyContainer } from '@testcontainers/valkey';
import { getContainerRuntimeClient } from 'testcontainers';

// Same images as infra/docker-compose.dev.yml so tests run against what developers run.
export const POSTGRES_IMAGE = 'pgvector/pgvector:0.8.7-pg17-trixie';
export const VALKEY_IMAGE = 'valkey/valkey:8.1.10-alpine3.24';

const EXTENSIONS_SQL = readFileSync(
  new URL('../../../../infra/postgres/init/01-extensions.sql', import.meta.url),
  'utf8',
);

export interface StartedService {
  url: string;
  stop: () => Promise<void>;
}

export type Service = 'postgres' | 'valkey';

const OVERRIDE_ENV: Record<Service, string> = {
  postgres: 'TEST_DATABASE_URL',
  valkey: 'TEST_VALKEY_URL',
};

export interface IntegrationRuntime {
  /** False when neither Docker nor an override URL can provide every needed service. */
  ready: boolean;
  reason: string;
}

let dockerProbe: Promise<boolean> | undefined;

function dockerAvailable(): Promise<boolean> {
  dockerProbe ??= getContainerRuntimeClient().then(
    () => true,
    () => false,
  );
  return dockerProbe;
}

/**
 * Decides whether integration tests can run. Locally, with no Docker and no `TEST_*_URL`
 * override, suites skip with a clear reason. In CI a missing runtime is an error, never a skip,
 * so integration coverage cannot silently disappear (CLAUDE.md §6).
 */
export async function detectIntegrationRuntime(
  needs: readonly Service[],
): Promise<IntegrationRuntime> {
  const missing = needs.filter((service) => !process.env[OVERRIDE_ENV[service]]);
  if (missing.length === 0) return { ready: true, reason: 'using TEST_*_URL overrides' };
  if (await dockerAvailable()) return { ready: true, reason: 'using Testcontainers' };

  const reason = `Docker is not available and ${missing.map((s) => OVERRIDE_ENV[s]).join(', ')} is not set`;
  if (process.env.CI) {
    throw new Error(`Integration tests cannot run in CI: ${reason}.`);
  }
  process.stderr.write(`\n[integration] skipping: ${reason}. They run in CI.\n`);
  return { ready: false, reason };
}

export interface StartPostgresOptions {
  /**
   * Applies the schema once the database is up. P1-T01 wires the Drizzle migrator in here;
   * until then the database has only the extensions from infra/postgres/init.
   */
  migrate?: (url: string) => Promise<void>;
}

/** Postgres 17 + pgvector with the project's extensions, or `TEST_DATABASE_URL` when set. */
export async function startPostgres(options: StartPostgresOptions = {}): Promise<StartedService> {
  const override = process.env.TEST_DATABASE_URL;
  if (override) {
    await options.migrate?.(override);
    return { url: override, stop: () => Promise.resolve() };
  }

  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('radd')
    .withUsername('postgres')
    .withPassword('postgres')
    .withCopyContentToContainer([
      { content: EXTENSIONS_SQL, target: '/docker-entrypoint-initdb.d/01-extensions.sql' },
    ])
    .start();
  const url = container.getConnectionUri();
  await options.migrate?.(url);
  return {
    url,
    stop: async () => {
      await container.stop();
    },
  };
}

/** Valkey 8 with a password, or `TEST_VALKEY_URL` when set. */
export async function startValkey(): Promise<StartedService> {
  const override = process.env.TEST_VALKEY_URL;
  if (override) return { url: override, stop: () => Promise.resolve() };

  const container = await new ValkeyContainer(VALKEY_IMAGE).withPassword('valkey').start();
  return {
    url: container.getConnectionUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}
