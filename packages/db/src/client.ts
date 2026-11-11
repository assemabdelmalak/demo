import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** What a repository receives: the pool-backed database or an open transaction. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface CreateDbOptions {
  url: string;
  /** Pool size; `DATABASE_POOL_MAX` for the apps. */
  max?: number;
  /** Shown in `pg_stat_activity`, e.g. `radd-api`. */
  applicationName?: string;
  connectionTimeoutMillis?: number;
  /** An idle client that errors must be logged, never thrown: it would crash the process. */
  onPoolError?: (error: Error) => void;
}

export interface DbHandle {
  db: Db;
  pool: Pool;
  close: () => Promise<void>;
}

export function createDb({
  url,
  max = 10,
  applicationName,
  connectionTimeoutMillis = 5_000,
  onPoolError,
}: CreateDbOptions): DbHandle {
  const config: PoolConfig = {
    connectionString: url,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis: 30_000,
  };
  if (applicationName !== undefined) config.application_name = applicationName;
  const pool = new Pool(config);
  pool.on('error', (error) => {
    onPoolError?.(error);
  });
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  };
}
