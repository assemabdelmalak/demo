import { customType, integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';

import { type LocalizedText, uuidv7 } from '@radd/shared';

/** UUIDv7 primary key generated in the app (DATA_MODEL §0), so IDs sort by creation time. */
export const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();

/** `updated_at` is kept current by the `set_updated_at()` trigger, so raw SQL updates it too. */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Soft-deleted rows stay for audit and are excluded by the repositories' default queries. */
export const softDelete = () => ({
  deletedAt: timestamptz('deleted_at'),
});

/** `{ ar?, en?, fr? }` in JSONB. Validate writes with `localizedTextSchema` from `@radd/shared`. */
export const localizedText = (name: string) => jsonb(name).$type<LocalizedText>();

/** Minor units of the restaurant's base currency: USD cents or whole LBP. Never a float. */
export const money = (name: string) => integer(name);

export const tstz = timestamptz;

/** Case-insensitive text (the `citext` extension), used for slugs. */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});
