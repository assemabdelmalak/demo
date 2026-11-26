import { describe, expect, it } from 'vitest';

import {
  accountEmailSchema,
  authCodeSchema,
  backupCodeInputSchema,
  emailCodeSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  signInPasswordSchema,
  signUpSchema,
} from './auth.js';

const issueCode = (result: { success: boolean; error?: { issues: { code: string }[] } }) =>
  result.error?.issues[0]?.code;

describe('account email', () => {
  it('trims and lower-cases like Better Auth', () => {
    expect(accountEmailSchema.parse('  Rana@Example.COM ')).toBe('rana@example.com');
  });

  it('tells an empty address apart from a malformed one', () => {
    expect(issueCode(accountEmailSchema.safeParse('   '))).toBe('too_small');
    expect(issueCode(accountEmailSchema.safeParse('rana@'))).toBe('invalid_format');
    expect(accountEmailSchema.safeParse(`${'a'.repeat(250)}@b.co`).success).toBe(false);
  });
});

describe('sign-up', () => {
  const valid = { name: 'Rana', email: 'rana@example.com', password: 'a'.repeat(12) };

  it('accepts a 12-character password and an Arabic name', () => {
    expect(signUpSchema.parse({ ...valid, name: ' رنا ' })).toEqual({ ...valid, name: 'رنا' });
  });

  it('matches the API password limits', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    const short = signUpSchema.safeParse({ ...valid, password: 'a'.repeat(11) });
    expect(issueCode(short)).toBe('too_small');
    const long = signUpSchema.safeParse({
      ...valid,
      password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(issueCode(long)).toBe('too_big');
  });

  it('refuses extra fields such as server-only flags', () => {
    expect(signUpSchema.safeParse({ ...valid, emailVerified: true }).success).toBe(false);
  });
});

describe('sign-in', () => {
  it('does not apply the new-password rules to an existing password', () => {
    expect(signInPasswordSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(
      true,
    );
    expect(issueCode(signInPasswordSchema.safeParse({ email: 'a@b.co', password: '' }))).toBe(
      'too_small',
    );
  });
});

describe('codes', () => {
  it('are exactly six Latin digits', () => {
    expect(authCodeSchema.safeParse('042424').success).toBe(true);
    for (const code of ['42424', '4242424', '٤٢٤٢٤٢', '42 424', 'abcdef']) {
      expect(authCodeSchema.safeParse(code).success, code).toBe(false);
    }
  });

  it('come with the address they were sent to', () => {
    expect(emailCodeSchema.parse({ email: 'A@B.co', otp: '123456' })).toEqual({
      email: 'a@b.co',
      otp: '123456',
    });
    expect(
      resetPasswordSchema.safeParse({ email: 'a@b.co', otp: '123456', password: 'short' }).success,
    ).toBe(false);
  });

  it('take backup codes as typed, trimmed', () => {
    expect(backupCodeInputSchema.parse({ code: ' abcde-12345 ' })).toEqual({ code: 'abcde-12345' });
    expect(backupCodeInputSchema.safeParse({ code: '' }).success).toBe(false);
  });
});
