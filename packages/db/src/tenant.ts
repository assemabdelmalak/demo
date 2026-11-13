import { AsyncLocalStorage } from 'node:async_hooks';

import { sql } from 'drizzle-orm';

import { isUuid } from '@radd/shared';

import { type Db } from './client.js';

/** An open transaction, as passed to the callbacks below and used by repositories. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface TenantScope {
  organizationId: string;
  /** The transaction that carries `app.org_id`; every query of the request must use it. */
  tx: DbTransaction;
}

const tenantStorage = new AsyncLocalStorage<TenantScope>();

/** The tenant of the current async call chain, if `withTenant` is running above it. */
export function currentTenantScope(): TenantScope | undefined {
  return tenantStorage.getStore();
}

/**
 * Runs `fn` in a transaction that can see and write one organisation's rows (ADR-003). The
 * setting is transaction-local, so it never leaks to the next user of the pooled connection and
 * works behind a transaction-mode pooler.
 */
export async function withTenant<T>(
  db: Db,
  organizationId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  // Checked here rather than left to the `::uuid` cast in the policy, which would fail on the
  // first query with a less obvious error.
  if (!isUuid(organizationId)) throw new TypeError('withTenant needs an organisation UUID');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
    return tenantStorage.run({ organizationId, tx }, () => fn(tx));
  });
}

/**
 * Runs `fn` in a transaction that can read what any diner may see: published menu versions of
 * live restaurants and the `public_restaurants` view. No tenant table is writable or readable.
 */
export async function withPublic<T>(db: Db, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.public', 'on', true)`);
    return fn(tx);
  });
}

/**
 * Runs `fn` in a transaction on the admin pool, which connects as `app_admin` and bypasses Row
 * Level Security. For the super-admin module only; every use must be audited (SECURITY §2).
 */
export async function withAdmin<T>(adminDb: Db, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return adminDb.transaction(fn);
}

export class MissingTenantContextError extends Error {
  constructor(repository: string) {
    super(`${repository} was used outside withTenant(); tenant data needs an organisation context`);
    this.name = 'MissingTenantContextError';
  }
}

/**
 * Base of every repository that touches tenant tables. It hands out the tenant transaction and
 * nothing else, so a repository cannot run a query without an organisation context: it throws
 * instead of silently reading zero rows.
 */
export abstract class BaseTenantRepository {
  protected get scope(): TenantScope {
    const scope = currentTenantScope();
    if (!scope) throw new MissingTenantContextError(this.constructor.name);
    return scope;
  }

  protected get tx(): DbTransaction {
    return this.scope.tx;
  }

  protected get organizationId(): string {
    return this.scope.organizationId;
  }
}
