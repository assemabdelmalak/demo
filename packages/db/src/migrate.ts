import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import { assertRolesSafe } from './roles.js';

/** Committed SQL migrations; shipped with the package so the API image can apply them. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Keeps the migration journal out of `public`, where the runtime roles have no access to it. */
export const MIGRATIONS_SCHEMA = 'drizzle';

export interface RunMigrationsOptions {
  /** Connection string of the schema owner (`DATABASE_URL_MIGRATOR`). */
  url: string;
}

/**
 * Applies every pending migration in order, each in a transaction. Uses one dedicated connection
 * rather than a pool: a deploy runs this once and exits.
 */
export async function runMigrations({ url }: RunMigrationsOptions): Promise<void> {
  const client = new Client({ connectionString: url, application_name: 'radd-migrate' });
  await client.connect();
  try {
    // Refuse to build on roles that could get around Row Level Security (ADR-021).
    await assertRolesSafe(client);
    await migrate(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
    });
  } finally {
    await client.end();
  }
}
