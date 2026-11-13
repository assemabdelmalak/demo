import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import {
  allergenCodeEnum,
  answerStatusEnum,
  chatIntentEnum,
  chatRoleEnum,
  dietTagEnum,
  importStatusEnum,
  localeEnum,
} from './enums.js';
import { menuVersions } from './menu.js';
import { assets, restaurants } from './restaurants.js';
import { dinerDevices, sessionParticipants, tableSessions } from './sessions.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { createdAt, id, timestamps, tstz } from '../columns.js';

export const importJobs = pgTable(
  'import_jobs',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    status: importStatusEnum('status').notNull().default('queued'),
    sourceAssetIds: uuid('source_asset_ids').array().notNull(),
    /** `{ sourceLocales?, targetLocales, currencyHint? }` */
    options: jsonb('options').$type<Record<string, unknown>>().notNull(),
    /** `{ pagesTotal, pagesDone, stage }` */
    progress: jsonb('progress').$type<Record<string, unknown>>().notNull().default({}),
    /** The merged imported menu, editable in review. */
    draft: jsonb('draft').$type<Record<string, unknown>>(),
    warnings: jsonb('warnings').$type<unknown[]>().notNull().default([]),
    error: jsonb('error').$type<Record<string, unknown>>(),
    /** `{ inputTokens, outputTokens, cacheReadTokens, costMicros, models }` */
    usage: jsonb('usage').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps(),
    appliedAt: tstz('applied_at'),
  },
  (t) => [
    orgIdUnique('import_jobs', t),
    tenantFk('import_jobs_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('import_jobs_restaurant_id_idx').on(t.restaurantId),
  ],
);

export const importJobPages = pgTable(
  'import_job_pages',
  {
    id: id(),
    // Not in DATA_MODEL's column list; added so the table is covered by RLS (ADR-022).
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    importJobId: uuid('import_job_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    pageIndex: integer('page_index').notNull(),
    status: text('status').notNull().default('queued'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    model: text('model'),
    usage: jsonb('usage').$type<Record<string, unknown>>().notNull().default({}),
    attempts: smallint('attempts').notNull().default(0),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    tenantFk('import_job_pages_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk(
      'import_job_pages_job_fk',
      t,
      t.importJobId,
      (): TenantParent => importJobs,
      'cascade',
    ),
    tenantFk('import_job_pages_asset_fk', t, t.assetId, (): TenantParent => assets),
    unique('import_job_pages_job_asset_page_uq').on(t.importJobId, t.assetId, t.pageIndex),
    index('import_job_pages_asset_id_idx').on(t.assetId),
  ],
);

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id'),
    participantId: uuid('participant_id'),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => dinerDevices.id),
    locale: localeEnum('locale').notNull(),
    /** The published menu the conversation is grounded in. */
    menuVersionId: uuid('menu_version_id').notNull(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    lastMessageAt: tstz('last_message_at').notNull().defaultNow(),
    messageCount: integer('message_count').notNull().default(0),
    flagged: boolean('flagged').notNull().default(false),
    flagReason: text('flag_reason'),
  },
  (t) => [
    orgIdUnique('chat_conversations', t),
    tenantFk(
      'chat_conversations_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk('chat_conversations_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    tenantFk(
      'chat_conversations_participant_fk',
      t,
      t.participantId,
      (): TenantParent => sessionParticipants,
    ),
    tenantFk(
      'chat_conversations_menu_version_fk',
      t,
      t.menuVersionId,
      (): TenantParent => menuVersions,
    ),
    index('chat_conversations_restaurant_started_idx').on(t.restaurantId, t.startedAt.desc()),
    index('chat_conversations_session_id_idx').on(t.sessionId),
    index('chat_conversations_participant_id_idx').on(t.participantId),
    index('chat_conversations_device_id_idx').on(t.deviceId),
    index('chat_conversations_menu_version_id_idx').on(t.menuVersionId),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    conversationId: uuid('conversation_id').notNull(),
    role: chatRoleEnum('role').notNull(),
    content: text('content').notNull(),
    /** Dish cards, allergen cards and proposals, by ID only. */
    uiBlocks: jsonb('ui_blocks').$type<unknown[]>().notNull().default([]),
    /** `[{ name, input, resultSummary, ms }]` */
    toolCalls: jsonb('tool_calls').$type<unknown[]>().notNull().default([]),
    /** `{ allergenMode, severity, lexiconHits, guardActions, templateUsed }` */
    safety: jsonb('safety').$type<Record<string, unknown>>().notNull().default({}),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    costMicros: integer('cost_micros'),
    latencyFirstTokenMs: integer('latency_first_token_ms'),
    latencyTotalMs: integer('latency_total_ms'),
    /** +1 or -1 from the diner. */
    feedback: smallint('feedback'),
    traceId: text('trace_id'),
    createdAt: createdAt(),
  },
  (t) => [
    orgIdUnique('chat_messages', t),
    tenantFk('chat_messages_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk(
      'chat_messages_conversation_fk',
      t,
      t.conversationId,
      (): TenantParent => chatConversations,
    ),
    index('chat_messages_conversation_created_idx').on(t.conversationId, t.createdAt),
  ],
);

/** Nightly classification of chat messages (insights). */
export const chatMessageLabels = pgTable(
  'chat_message_labels',
  {
    messageId: uuid('message_id').primaryKey(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    intent: chatIntentEnum('intent').notNull(),
    dishIds: uuid('dish_ids').array().notNull().default([]),
    allergens: allergenCodeEnum('allergens').array().notNull().default([]),
    diets: dietTagEnum('diets').array().notNull().default([]),
    answerStatus: answerStatusEnum('answer_status').notNull(),
    /** Normalised cluster key, e.g. `is_X_gluten_free`. */
    topicKey: text('topic_key'),
    model: text('model'),
    classifiedAt: tstz('classified_at').notNull().defaultNow(),
  },
  (t) => [
    tenantFk(
      'chat_message_labels_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk(
      'chat_message_labels_message_fk',
      t,
      t.messageId,
      (): TenantParent => chatMessages,
      'cascade',
    ),
    index('chat_message_labels_restaurant_classified_idx').on(t.restaurantId, t.classifiedAt),
  ],
);
