import { randomBytes } from 'node:crypto';

import { Client } from 'pg';

import { runMigrations } from '../migrate.js';

export * from './factories.js';

export interface TestDatabase {
  /** Name of the throwaway database. */
  name: string;
  /** Superuser connection to the new database. */
  url: string;
  drop: () => Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function asSuperuser<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, application_name: 'radd-test-setup' });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * A fresh, migrated database for one test suite, on the server `superuserUrl` points at
 * (a Testcontainers Postgres or `TEST_DATABASE_URL`). Suites never share tables, so they can run
 * against one server without seeing each other's rows.
 */
export async function createTestDatabase(superuserUrl: string): Promise<TestDatabase> {
  const name = `radd_test_${randomBytes(6).toString('hex')}`;
  await asSuperuser(superuserUrl, (client) => client.query(`CREATE DATABASE ${name}`));
  const url = withDatabase(superuserUrl, name);
  await runMigrations({ url });
  return {
    name,
    url,
    drop: () =>
      asSuperuser(superuserUrl, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }),
  };
}
