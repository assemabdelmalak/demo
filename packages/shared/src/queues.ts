import { z } from 'zod';

/**
 * Payload of a queue whose producer has not been built yet. Enqueueing to it fails validation, so
 * nothing can be scheduled before its phase defines the real schema.
 */
const notYetDefined = z.never().describe('Payload defined by the phase that adds the producer');

/** Sample job used to prove the queue plumbing (P0-T05). */
export const noopPayloadSchema = z.object({
  message: z.string().min(1).max(200),
  /** Makes the processor throw, to exercise retries and backoff. */
  fail: z.boolean().default(false),
  /** Simulated work, to exercise graceful shutdown. */
  delayMs: z.number().int().min(0).max(10_000).default(0),
});

interface QueueSpec<S extends z.ZodType> {
  concurrency: number;
  payload: S;
  description: string;
}

function queue<S extends z.ZodType>(spec: QueueSpec<S>): QueueSpec<S> {
  return spec;
}

/**
 * Every background queue (ARCHITECTURE §5). Names use dots because BullMQ reserves `:` as its key
 * separator. Concurrency is per worker process.
 */
export const QUEUES = {
  'image.process': queue({
    concurrency: 4,
    payload: notYetDefined,
    description: 'sharp variants, thumbhash, EXIF strip',
  }),
  'menu.publish': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'build snapshot + AI context, cache warm, revalidate diner',
  }),
  'import.extract': queue({
    concurrency: 3,
    payload: notYetDefined,
    description: 'per-page extraction via Claude (rate-limited per org)',
  }),
  'import.finalize': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'merge, translate, suggest allergens, validate',
  }),
  'ai.translate': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'on-demand translation batches',
  }),
  'ai.allergen_suggest': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'on-demand allergen suggestions',
  }),
  'events.flush': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'batch-insert analytics events from a Valkey stream',
  }),
  'chat.classify': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'nightly Message Batch submit and poll',
  }),
  'insights.daily': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'nightly rollups',
  }),
  'insights.weekly': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'Monday report generation and delivery',
  }),
  'notify.email': queue({ concurrency: 4, payload: notYetDefined, description: 'outbound email' }),
  'notify.whatsapp': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'outbound WhatsApp messages',
  }),
  'sessions.housekeeping': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'abandon idle sessions, flag long ones (every 5 min)',
  }),
  'db.maintenance': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'future partitions, retention purges (daily)',
  }),
  'subscriptions.reminders': queue({
    concurrency: 1,
    payload: notYetDefined,
    description: 'expiry reminders, downgrade after grace (daily)',
  }),
  'outbox.dispatch': queue({
    concurrency: 2,
    payload: notYetDefined,
    description: 'reliable domain events to sockets and integrations',
  }),
  noop: queue({
    concurrency: 1,
    payload: noopPayloadSchema,
    description: 'plumbing check (P0-T05)',
  }),
} as const;

export type QueueName = keyof typeof QUEUES;
export type QueuePayload<N extends QueueName> = z.output<(typeof QUEUES)[N]['payload']>;
export type QueuePayloadInput<N extends QueueName> = z.input<(typeof QUEUES)[N]['payload']>;

export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

/** Valkey key prefix for every BullMQ structure. */
export const QUEUE_PREFIX = 'radd';

/**
 * Retry policy for every job unless a queue overrides it (P0-T05): three attempts with
 * exponential backoff, then the job stays in the failed set for a week for inspection.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;

export function parseQueuePayload<N extends QueueName>(name: N, payload: unknown): QueuePayload<N> {
  return QUEUES[name].payload.parse(payload) as QueuePayload<N>;
}
