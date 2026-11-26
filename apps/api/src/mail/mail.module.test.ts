import { describe, expect, it } from 'vitest';

import { createMailer } from './mail.module';
import { type ApiEnv } from '../config/env.module';

const env = (overrides: Partial<ApiEnv>): ApiEnv =>
  ({
    MAIL_PROVIDER: 'smtp',
    SMTP_URL: 'smtp://localhost:1025',
    EMAIL_FROM: 'Radd Menu <no-reply@localhost>',
    ...overrides,
  }) as ApiEnv;

describe('createMailer', () => {
  it('builds the SMTP adapter', () => {
    expect(typeof createMailer(env({})).send).toBe('function');
  });

  it('names the missing variable when SMTP has no URL', () => {
    expect(() => createMailer(env({ SMTP_URL: undefined }))).toThrow(/SMTP_URL/);
  });

  it('says when Resend arrives', () => {
    expect(() => createMailer(env({ MAIL_PROVIDER: 'resend' }))).toThrow(/P9-T04/);
  });
});
