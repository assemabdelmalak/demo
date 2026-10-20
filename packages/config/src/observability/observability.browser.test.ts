import * as Sentry from '@sentry/browser';
import { afterEach, describe, expect, it } from 'vitest';

import { sentryOptions } from './index.js';

/**
 * The browser SDK the diner and console load, with the shared options and a transport that
 * records envelopes. Relay stores a client's IP when an event says `infer_ip: "auto"` or a
 * session carries `{{auto}}`, so neither may appear.
 */
function initRecording() {
  const envelopes: unknown[] = [];
  const client = Sentry.init({
    ...sentryOptions({
      dsn: 'https://public@o0.ingest.sentry.io/1',
      release: 'abc1234',
      environment: 'test',
    }),
    skipBrowserExtensionCheck: true,
    transport: () => ({
      send: (envelope) => {
        envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  });
  if (!client) throw new Error('Sentry did not initialise');
  return { client, envelopes };
}

afterEach(async () => {
  await Sentry.close();
});

describe('browser Sentry with the shared options', () => {
  it('never asks Sentry to infer and store the diner IP', async () => {
    const { client, envelopes } = initRecording();
    expect(client.getOptions()._metadata?.sdk?.settings).toEqual({ infer_ip: 'never' });

    Sentry.captureException(new Error('menu failed to render'));
    await Sentry.flush(1_000);
    const serialized = JSON.stringify(envelopes);
    expect(serialized).toContain('menu failed to render');
    expect(serialized).toContain('"infer_ip":"never"');
    expect(serialized).not.toContain('{{auto}}');
  });

  it('adds no IP placeholder to sessions', () => {
    const { client } = initRecording();
    const session: { ipAddress?: string } = {};
    client.emit('beforeSendSession', session as never);
    expect(session.ipAddress).toBeUndefined();
  });
});
