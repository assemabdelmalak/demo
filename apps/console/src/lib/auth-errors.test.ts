import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  type Failure,
  failureMessage,
  parseRetryAfter,
  runApi,
  runAuth,
  toApiFailure,
  toAuthFailure,
} from './auth-errors';

const catalogue = (locale: string) =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')) as {
    errors: Record<string, string>;
  };

describe('toAuthFailure', () => {
  it('keeps the Better Auth code and status', () => {
    expect(
      toAuthFailure({ status: 401, statusText: 'Unauthorized', code: 'INVALID_EMAIL_OR_PASSWORD' }),
    ).toEqual({ kind: 'code', code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 });
  });

  it('reads the wait time the auth client folds into a 429', () => {
    expect(toAuthFailure({ status: 429, code: 'RATE_LIMITED', retryAfter: 7 })).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 7,
    });
    expect(toAuthFailure({ status: 429, retryAfter: null })).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: null,
    });
  });

  it('treats a request that got no response as a network failure', () => {
    expect(toAuthFailure({ status: 500, statusText: 'Fetch Error' })).toEqual({ kind: 'network' });
    expect(toAuthFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
  });

  it('keeps a codeless error as unknown with its status', () => {
    expect(toAuthFailure({ status: 400, message: 'Invitation not found!' })).toEqual({
      kind: 'unknown',
      status: 400,
    });
  });
});

describe('toApiFailure', () => {
  it('reads the problem code, and Retry-After on a 429', () => {
    expect(
      toApiFailure({ code: 'ORG_LIMIT_REACHED' }, new Response(null, { status: 409 })),
    ).toEqual({ kind: 'code', code: 'ORG_LIMIT_REACHED', status: 409 });
    expect(
      toApiFailure(
        { code: 'RATE_LIMITED' },
        new Response(null, { status: 429, headers: { 'retry-after': '30' } }),
      ),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 30 });
    expect(toApiFailure(undefined, undefined)).toEqual({ kind: 'network' });
  });
});

describe('parseRetryAfter', () => {
  it('accepts positive delta-seconds only', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(' 3 ')).toBe(3);
    for (const value of ['0', '-1', '1.5', 'Wed, 21 Oct 2015 07:28:00 GMT', '', null, undefined]) {
      expect(parseRetryAfter(value), String(value)).toBeNull();
    }
  });
});

describe('failureMessage', () => {
  it('maps known codes to specific messages', () => {
    expect(
      failureMessage({ kind: 'code', code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }),
    ).toEqual({ key: 'invalidCredentials' });
    expect(failureMessage({ kind: 'code', code: 'INVALID_OTP', status: 400 }).key).toBe(
      'invalidCode',
    );
    expect(failureMessage({ kind: 'code', code: 'ORG_LIMIT_REACHED', status: 409 }).key).toBe(
      'orgLimit',
    );
  });

  it('gives the wait time when it is known', () => {
    expect(failureMessage({ kind: 'rate-limited', retryAfterSeconds: 9 })).toEqual({
      key: 'rateLimited',
      values: { seconds: 9 },
    });
    expect(failureMessage({ kind: 'rate-limited', retryAfterSeconds: null }).key).toBe(
      'rateLimitedLater',
    );
  });

  it('never surfaces an unknown code, and tells server trouble apart', () => {
    expect(failureMessage({ kind: 'code', code: 'SOMETHING_NEW', status: 400 }).key).toBe(
      'generic',
    );
    expect(failureMessage({ kind: 'code', code: 'SOMETHING_NEW', status: 502 }).key).toBe(
      'unavailable',
    );
    expect(failureMessage({ kind: 'unknown', status: null }).key).toBe('generic');
    expect(failureMessage({ kind: 'network' }).key).toBe('network');
  });

  it('only uses keys both catalogues have', () => {
    const failures: Failure[] = [
      { kind: 'network' },
      { kind: 'rate-limited', retryAfterSeconds: 1 },
      { kind: 'rate-limited', retryAfterSeconds: null },
      { kind: 'unknown', status: 503 },
      ...[
        'INVALID_EMAIL_OR_PASSWORD',
        'EMAIL_NOT_VERIFIED',
        'INVALID_PASSWORD',
        'PASSWORD_TOO_SHORT',
        'PASSWORD_TOO_LONG',
        'INVALID_EMAIL',
        'INVALID_OTP',
        'OTP_EXPIRED',
        'TOO_MANY_ATTEMPTS',
        'INVALID_CODE',
        'INVALID_BACKUP_CODE',
        'INVALID_TWO_FACTOR_COOKIE',
        'ACCOUNT_TEMPORARILY_LOCKED',
        'INVITATION_NOT_FOUND',
        'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION',
        'ALREADY_A_MEMBER',
        'ORG_LIMIT_REACHED',
        'ORG_SUSPENDED',
        'UNAUTHENTICATED',
        'SERVICE_UNAVAILABLE',
      ].map((code): Failure => ({ kind: 'code', code, status: 400 })),
    ];
    for (const locale of ['en', 'ar']) {
      const { errors } = catalogue(locale);
      for (const failure of failures) {
        expect(errors[failureMessage(failure).key], `${locale} ${JSON.stringify(failure)}`).toEqual(
          expect.any(String),
        );
      }
    }
  });
});

describe('runAuth and runApi', () => {
  it('turn results and thrown errors into one shape', async () => {
    expect(await runAuth(() => Promise.resolve({ data: { ok: 1 }, error: null }))).toEqual({
      ok: true,
      data: { ok: 1 },
    });
    expect(
      await runAuth(() => Promise.resolve({ data: null, error: { status: 403, code: 'X' } })),
    ).toEqual({ ok: false, failure: { kind: 'code', code: 'X', status: 403 } });
    expect(await runAuth(() => Promise.reject(new TypeError('offline')))).toEqual({
      ok: false,
      failure: { kind: 'network' },
    });
    expect(
      await runApi(() =>
        Promise.resolve({ data: { id: 1 }, response: new Response(null, { status: 201 }) }),
      ),
    ).toEqual({ ok: true, data: { id: 1 } });
    expect(await runApi(() => Promise.reject(new TypeError('offline')))).toEqual({
      ok: false,
      failure: { kind: 'network' },
    });
  });
});
