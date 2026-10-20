import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { loggerOptions } from './index.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = pino(loggerOptions({ service: 'test', level: 'trace', pretty: false }), stream);
  return { logger, output: () => lines.join('') };
}

describe('log redaction', () => {
  it('never writes cookies or authorization headers from serialised requests', () => {
    const { logger, output } = capture();
    logger.info(
      {
        req: {
          method: 'POST',
          url: '/v1/sessions',
          headers: {
            cookie: 'rm_dev=device-secret; rm_pt=participant-secret',
            authorization: 'Bearer bearer-secret',
            'user-agent': 'vitest',
          },
        },
        res: { statusCode: 200, headers: { 'set-cookie': 'rm_pt=new-participant-secret' } },
      },
      'request completed',
    );
    const text = output();
    expect(text).toContain('vitest');
    for (const secret of ['device-secret', 'participant-secret', 'bearer-secret']) {
      expect(text).not.toContain(secret);
    }
  });

  it('redacts tokens, OTPs, PINs and payment references in log objects', () => {
    const { logger, output } = capture();
    logger.info({
      token: 'top-token',
      otp: '123456',
      payment: { externalReference: 'WHISH-998877', pin: '4321' },
      auth: { token: 'nested-token', password: 'hunter2' },
    });
    const text = output();
    for (const secret of [
      'top-token',
      '123456',
      'WHISH-998877',
      '4321',
      'nested-token',
      'hunter2',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[redacted]');
  });

  it('tags every line with the service and release', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    pino(
      loggerOptions({ service: 'api', level: 'info', pretty: false, release: 'abc123' }),
      stream,
    ).info('hi');
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      service: 'api',
      release: 'abc123',
      msg: 'hi',
    });
  });
});
