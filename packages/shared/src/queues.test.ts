import { describe, expect, it } from 'vitest';

import { DEFAULT_JOB_OPTIONS, parseQueuePayload, QUEUE_NAMES, QUEUES } from './queues.js';

describe('queue registry', () => {
  it('lists every queue from ARCHITECTURE §5 plus noop', () => {
    expect(QUEUE_NAMES.sort()).toEqual(
      [
        'ai.allergen_suggest',
        'ai.translate',
        'chat.classify',
        'db.maintenance',
        'events.flush',
        'image.process',
        'import.extract',
        'import.finalize',
        'insights.daily',
        'insights.weekly',
        'menu.publish',
        'noop',
        'notify.email',
        'notify.whatsapp',
        'outbox.dispatch',
        'sessions.housekeeping',
        'subscriptions.reminders',
      ].sort(),
    );
  });

  it('uses names BullMQ accepts and positive concurrency', () => {
    for (const name of QUEUE_NAMES) {
      expect(name).not.toContain(':');
      expect(QUEUES[name].concurrency).toBeGreaterThan(0);
    }
  });

  it('retries three times with exponential backoff by default', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
  });
});

describe('parseQueuePayload', () => {
  it('applies noop defaults and rejects bad payloads', () => {
    expect(parseQueuePayload('noop', { message: 'hi' })).toEqual({
      message: 'hi',
      fail: false,
      delayMs: 0,
    });
    expect(() => parseQueuePayload('noop', { message: '' })).toThrow();
  });

  it('refuses jobs for queues whose payload is not defined yet', () => {
    expect(() => parseQueuePayload('menu.publish', { restaurantId: 'x' })).toThrow();
  });
});
