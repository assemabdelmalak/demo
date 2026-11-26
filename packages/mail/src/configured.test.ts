import { describe, expect, it } from 'vitest';

import { createConfiguredMailer, emailDomain, redact } from './configured.js';

describe('createConfiguredMailer', () => {
  const base = { MAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Radd Menu <no-reply@localhost>' } as const;

  it('builds SMTP and names what is missing', () => {
    expect(typeof createConfiguredMailer({ ...base, SMTP_URL: 'smtp://localhost:1025' }).send).toBe(
      'function',
    );
    expect(() => createConfiguredMailer(base)).toThrow(/SMTP_URL/);
    expect(() => createConfiguredMailer({ ...base, MAIL_PROVIDER: 'resend' })).toThrow(/P9-T04/);
  });
});

describe('log hygiene helpers', () => {
  it('keeps only the domain of an address', () => {
    expect(emailDomain('Rana@Example.COM')).toBe('example.com');
    expect(emailDomain('nobody')).toBe('unknown');
  });

  it('cuts every secret out of a message', () => {
    expect(redact('550 a@b.co at https://x/y and a@b.co', 'a@b.co', 'https://x/y')).toBe(
      '550 [redacted] at [redacted] and [redacted]',
    );
    expect(redact('unchanged', '')).toBe('unchanged');
  });
});
