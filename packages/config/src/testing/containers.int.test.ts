import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from './containers.js';

const postgresRuntime = await detectIntegrationRuntime(['postgres']);
const valkeyRuntime = await detectIntegrationRuntime(['valkey']);

describe.skipIf(!postgresRuntime.ready)('startPostgres', () => {
  let service: StartedService;
  let client: pg.Client;

  beforeAll(async () => {
    service = await startPostgres();
    client = new pg.Client({ connectionString: service.url });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await service.stop();
  });

  it('runs PostgreSQL 17', async () => {
    const { rows } = await client.query<{ server_version_num: string }>('show server_version_num');
    expect(Number(rows[0]?.server_version_num)).toBeGreaterThanOrEqual(170000);
  });

  it('has the extensions from DATA_MODEL §0', async () => {
    const { rows } = await client.query<{ extname: string }>(
      `select extname from pg_extension where extname in ('pg_trgm','unaccent','citext','vector') order by extname`,
    );
    expect(rows.map((row) => row.extname)).toEqual(['citext', 'pg_trgm', 'unaccent', 'vector']);
  });

  it('runs the migrate hook against the started database', async () => {
    let migratedUrl: string | undefined;
    const second = await startPostgres({
      migrate: (url) => {
        migratedUrl = url;
        return Promise.resolve();
      },
    });
    try {
      expect(migratedUrl).toBe(second.url);
    } finally {
      await second.stop();
    }
  });
});

describe.skipIf(!valkeyRuntime.ready)('startValkey', () => {
  let service: StartedService;

  beforeAll(async () => {
    service = await startValkey();
  });

  afterAll(async () => {
    await service.stop();
  });

  it('answers PING with the password from the URL', async () => {
    const redis = new Redis(service.url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      expect(await redis.ping()).toBe('PONG');
    } finally {
      redis.disconnect();
    }
  });
});
