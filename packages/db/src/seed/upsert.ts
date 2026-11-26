import { getTableColumns, getTableName, type SQL, sql } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';

import { type DbExecutor } from '../client.js';

export interface UpsertCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface UpsertOptions {
  /** The conflict target: the primary key, or the unique columns that identify a seeded row. */
  target: PgColumn | PgColumn[];
  /**
   * Properties written on insert only and never compared or updated: values that are stamped once
   * (a decision time) or must survive a re-seed (a printed QR token).
   */
  insertOnly?: readonly string[];
}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const BATCH = 500;

/**
 * `INSERT … ON CONFLICT DO UPDATE` that only updates a row whose values differ. Every table with
 * `updated_at` has a trigger that bumps it on any UPDATE, so a plain upsert would change every row
 * on every run; with the `IS DISTINCT FROM` guard a second run touches nothing. Columns a row
 * leaves out keep their defaults on insert and are never updated (e.g. `created_at`).
 */
export async function upsertRows<T extends PgTable>(
  db: DbExecutor,
  table: T,
  rows: readonly T['$inferInsert'][],
  { target, insertOnly = [] }: UpsertOptions,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
  if (rows.length === 0) return counts;

  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const targetNames = new Set([target].flat().map((column) => column.name));
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const updatable = keys.filter((key) => {
    const column = columns[key];
    if (!column) throw new Error(`${getTableName(table)} has no column for ${key}`);
    return !insertOnly.includes(key) && !targetNames.has(column.name);
  });

  const tableName = quote(getTableName(table));
  const name = (key: string) => quote(columns[key]?.name ?? key);
  const set = Object.fromEntries(
    updatable.map((key) => [key, sql.raw(`excluded.${name(key)}`)]),
  ) as Record<string, SQL>;
  const changed = sql.raw(
    `row(${updatable.map((key) => `${tableName}.${name(key)}`).join(', ')}) is distinct from ` +
      `row(${updatable.map((key) => `excluded.${name(key)}`).join(', ')})`,
  );
  // A row the statement inserted has no deleting transaction yet; an updated one has ours.
  const returning = { inserted: sql<boolean>`(xmax = 0)` };

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const insert = db.insert(table).values(batch);
    const written =
      updatable.length === 0
        ? await insert.onConflictDoNothing({ target }).returning(returning)
        : await insert.onConflictDoUpdate({ target, set, setWhere: changed }).returning(returning);
    const inserted = written.filter((row) => row.inserted).length;
    counts.inserted += inserted;
    counts.updated += written.length - inserted;
    counts.unchanged += batch.length - written.length;
  }
  return counts;
}
