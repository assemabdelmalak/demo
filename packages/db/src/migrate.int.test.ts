import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, type StartedService, startPostgres } from '@radd/config/testing';

import { MIGRATIONS_SCHEMA, runMigrations } from './migrate.js';
import { createTestDatabase, type TestDatabase } from './testing/index.js';

const runtime = await detectIntegrationRuntime(['postgres']);

describe.skipIf(!runtime.ready)('runMigrations', () => {
  let postgres: StartedService;
  let database: TestDatabase;
  let client: Client;

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await createTestDatabase(postgres.url);
    client = new Client({ connectionString: database.url });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await database.drop();
    await postgres.stop();
  });

  it('applies every committed migration to an empty database', async () => {
    const { rows } = await client.query<{ extname: string }>(
      `select extname from pg_extension where extname in ('pg_trgm', 'unaccent', 'citext') order by 1`,
    );
    expect(rows.map((row) => row.extname)).toEqual(['citext', 'pg_trgm', 'unaccent']);
  });

  it('records each migration once and does nothing on a second run', async () => {
    const count = async () => {
      const { rows } = await client.query<{ n: string }>(
        `select count(*) as n from ${MIGRATIONS_SCHEMA}.__drizzle_migrations`,
      );
      return Number(rows[0]?.n);
    };
    const before = await count();
    expect(before).toBeGreaterThan(0);

    await runMigrations({ url: database.url });
    expect(await count()).toBe(before);
  });
});
