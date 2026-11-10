import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';

import { sentryOptions } from '@radd/config/observability';

/**
 * Runs the real SDK with the shared options and a transport that records envelopes instead of
 * sending them, proving what would reach Sentry (P0-T09 acceptance: an error appears when a DSN
 * is set; nothing identifying a diner does).
 */
interface Recorded {
  events: Record<string, unknown>[];
  /** Every envelope line, headers included, as sent. */
  raw: string[];
}

function initWithRecorder(dsn: string | undefined, tracesSampleRate = 0): Recorded {
  const recorded: Recorded = { events: [], raw: [] };
  const options = sentryOptions({ dsn, release: 'abc1234', environment: 'test', tracesSampleRate });
  Sentry.init({
    ...options,
    // Ours plus the one that copies request data onto events, as the HTTP servers would.
    defaultIntegrations: false,
    integrations: [...options.integrations, Sentry.requestDataIntegration()],
    transport: (options) =>
      Sentry.createTransport(options, (request) => {
        const body =
          typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
        for (const line of body.split('\n')) {
          recorded.raw.push(line);
          const item = JSON.parse(line) as Record<string, unknown>;
          if ('exception' in item) recorded.events.push(item);
        }
        return Promise.resolve({ statusCode: 200 });
      }),
  });
  return recorded;
}

function captureWithDinerData(): void {
  Sentry.withScope((scope) => {
    scope.setUser({ id: 'participant-1', ip_address: '203.0.113.7' });
    scope.addBreadcrumb({ category: 'console', message: 'chat: is the fattoush nut-free?' });
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        url: 'https://api.radd.test/v1/receipts/rcpt_secret?token=abc',
        method: 'POST',
        headers: {
          cookie: 'radd_session=s3cret',
          authorization: 'Bearer t0ken',
          'x-participant-token': 'p4rticipant',
          'user-agent': 'Mozilla/5.0',
          'x-request-id': '0199f2a4-5b6c-7d8e-9f01-23456789abcd',
        },
        cookies: { radd_session: 's3cret' },
        query_string: 'token=abc',
        data: '{"message":"my name is Rania"}',
      },
    });
    Sentry.captureException(new Error('kitchen printer offline'));
  });
}

afterEach(async () => {
  await Sentry.close();
});

describe('Sentry with the shared options', () => {
  it('sends an error tagged with the release and environment when a DSN is set', async () => {
    const { events } = initWithRecorder('https://public@o0.ingest.sentry.io/1');
    captureWithDinerData();
    await Sentry.flush(2_000);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({ release: 'abc1234', environment: 'test' });
    expect(JSON.stringify(event)).toContain('kitchen printer offline');
  });

  it('strips cookies, credentials, bodies, query strings, users and console breadcrumbs', async () => {
    const { events } = initWithRecorder('https://public@o0.ingest.sentry.io/1');
    captureWithDinerData();
    await Sentry.flush(2_000);

    const serialized = JSON.stringify(events);
    for (const secret of ['s3cret', 't0ken', 'p4rticipant', 'rcpt_secret', 'token=abc', 'Rania']) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('203.0.113.7');
    expect(serialized).not.toContain('fattoush');
    expect(events[0]).toMatchObject({
      request: {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'x-request-id': '0199f2a4-5b6c-7d8e-9f01-23456789abcd',
        },
      },
    });
  });

  it('strips secrets from performance spans, which skip beforeSend', async () => {
    const { raw } = initWithRecorder('https://public@o0.ingest.sentry.io/1', 1);
    Sentry.startSpan(
      {
        name: 'GET /v1/public/receipts/rcpt_secret?token=abc',
        attributes: {
          'url.full': 'https://api.radd.test/v1/public/receipts/rcpt_secret?token=abc',
        },
      },
      () => {
        Sentry.startSpan(
          {
            name: 'PUT',
            attributes: {
              'http.url': 'https://s3.radd.test/radd-private/a.jpg?X-Amz-Signature=sig',
            },
          },
          () => undefined,
        );
      },
    );
    await Sentry.flush(2_000);

    const serialized = raw.join('\n');
    expect(serialized).toContain('/receipts/[redacted]');
    for (const secret of ['rcpt_secret', 'token=abc', 'X-Amz-Signature']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('sends nothing without a DSN', async () => {
    const { events } = initWithRecorder(undefined);
    captureWithDinerData();
    await Sentry.flush(500);
    expect(events).toEqual([]);
  });
});
