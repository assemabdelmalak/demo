import { describe, expect, it } from 'vitest';

import { authRelativePath, CODE_REQUEST_PATHS, hasCookie } from './auth.fastify';

describe('authRelativePath', () => {
  it('strips the base path and the query string', () => {
    expect(authRelativePath('/v1/auth/sign-in/email?x=1', '/v1/auth')).toBe('/sign-in/email');
  });

  it('normalises slashes so the code-email cap cannot be sidestepped', () => {
    for (const url of [
      '/v1/auth/email-otp/send-verification-otp/',
      '/v1/auth//email-otp//send-verification-otp',
    ]) {
      expect(CODE_REQUEST_PATHS.has(authRelativePath(url, '/v1/auth'))).toBe(true);
    }
  });
});

describe('hasCookie', () => {
  it('finds a cookie by exact name only', () => {
    expect(hasCookie('a=1; radd-test.session_token=abc', 'radd-test.session_token')).toBe(true);
    expect(hasCookie('xradd-test.session_token=abc', 'radd-test.session_token')).toBe(false);
    expect(hasCookie('radd-test.session_token_data=abc', 'radd-test.session_token')).toBe(false);
    expect(hasCookie(undefined, 'radd-test.session_token')).toBe(false);
  });
});
