import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Writable } from 'node:stream';

import pino from 'pino';
import { pinoHttp } from 'pino-http';
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

describe('HTTP request logging (pino-http)', () => {
  async function logOneRequest(path: string, headers: Record<string, string>): Promise<string> {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const httpLogger = pinoHttp({
      ...loggerOptions({ service: 'test', level: 'info', pretty: false }),
      stream,
    });
    const server = createServer((req, res) => {
      httpLogger(req, res);
      res.setHeader('set-cookie', 'rm_pt=response-cookie-secret');
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await fetch(`http://127.0.0.1:${String(port)}${path}`, { headers });
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    return lines.join('');
  }

  it('keeps the method, path and user agent', async () => {
    const line = JSON.parse(await logOneRequest('/v1/menu', { 'user-agent': 'vitest-agent' })) as {
      req: { method: string; url: string; headers: Record<string, string> };
      res: { statusCode: number };
    };
    expect(line.req).toMatchObject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'user-agent': 'vitest-agent' },
    });
    expect(line.res.statusCode).toBe(200);
  });

  it('drops query strings, secret path segments, cookies, auth and client IPs', async () => {
    const text = await logOneRequest('/v1/public/receipts/receipt-path-secret?token=query-secret', {
      cookie: 'rm_dev=cookie-secret',
      authorization: 'Bearer auth-secret',
      'x-forwarded-for': '198.51.100.23',
      'cf-connecting-ip': '198.51.100.24',
    });
    expect(text).toContain('/v1/public/receipts/[redacted]');
    for (const secret of [
      'receipt-path-secret',
      'query-secret',
      'cookie-secret',
      'auth-secret',
      'response-cookie-secret',
      '198.51.100.23',
      '198.51.100.24',
      '127.0.0.1',
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('error logging', () => {
  it('omits client-library payloads attached to errors, such as ioredis command arguments', () => {
    const { logger, output } = capture();
    const error = Object.assign(new Error('OOM command not allowed'), {
      command: { name: 'set', args: ['idem:k', '{"body":{"token":"participant-jwt-secret"}}'] },
      code: 'ERR',
    });
    logger.error({ err: error }, 'could not store');
    const text = output();
    expect(text).toContain('OOM command not allowed');
    expect(text).not.toContain('participant-jwt-secret');
  });
});
