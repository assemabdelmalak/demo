import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { runMigrations } from '../migrate.js';
import { APP_ROLES } from '../roles.js';

export * from './factories.js';
export * from './tenant-fixture.js';

const BOOTSTRAP_SQL = readFileSync(
  fileURLToPath(new URL('../../sql/bootstrap-roles.sql', import.meta.url)),
  'utf8',
);

/** Any constant works; it only has to be the same for every test process on the server. */
const BOOTSTRAP_LOCK = 7_231_001;

export interface TestDatabase {
  /** Name of the throwaway database. */
  name: string;
  urls: {
    /** Bypasses everything; for assertions on the catalog and for cleanup only. */
    superuser: string;
    migrator: string;
    /** What the API connects as: Row Level Security applies. */
    runtime: string;
    /** What the worker connects as: Row Level Security applies. */
    worker: string;
    /** What the super-admin module connects as: bypasses Row Level Security. */
    admin: string;
  };
  drop: () => Promise<void>;
}

function withTarget(url: string, database: string, role?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (role !== undefined) {
    parsed.username = role;
    // Test-only passwords, set below. Real passwords are set by the operator (ADR-021).
    parsed.password = role;
  }
  return parsed.toString();
}

async function connected<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, application_name: 'radd-test-setup' });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * A fresh database for one test suite, built the way production is (ADR-021): a superuser runs
 * the role bootstrap, `app_migrator` applies the migrations, and the suite gets one URL per role.
 * `superuserUrl` is a Testcontainers Postgres or `TEST_DATABASE_URL`. Suites never share tables,
 * so they can run against one server at the same time.
 */
export async function createTestDatabase(superuserUrl: string): Promise<TestDatabase> {
  const name = `radd_test_${randomBytes(6).toString('hex')}`;

  await connected(superuserUrl, async (maintenance) => {
    // Roles are cluster-wide and suites start in parallel: creating or altering the same role
    // from two sessions at once fails. The lock is taken on the shared maintenance database.
    await maintenance.query('select pg_advisory_lock($1)', [BOOTSTRAP_LOCK]);
    try {
      await maintenance.query(`CREATE DATABASE ${name}`);
      await connected(withTarget(superuserUrl, name), async (fresh) => {
        await fresh.query(BOOTSTRAP_SQL);
        for (const role of Object.values(APP_ROLES)) {
          await fresh.query(`ALTER ROLE ${role} PASSWORD '${role}'`);
        }
      });
    } finally {
      await maintenance.query('select pg_advisory_unlock($1)', [BOOTSTRAP_LOCK]);
    }
  });

  const urls = {
    superuser: withTarget(superuserUrl, name),
    migrator: withTarget(superuserUrl, name, APP_ROLES.migrator),
    runtime: withTarget(superuserUrl, name, APP_ROLES.runtime),
    worker: withTarget(superuserUrl, name, APP_ROLES.worker),
    admin: withTarget(superuserUrl, name, APP_ROLES.admin),
  };
  await runMigrations({ url: urls.migrator });

  return {
    name,
    urls,
    drop: () =>
      connected(superuserUrl, async (maintenance) => {
        await maintenance.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }),
  };
}
