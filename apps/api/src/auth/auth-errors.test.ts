import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { DomainError } from '@radd/shared';

import { authErrorCode, toDomainError } from './auth-errors';

const apiError = (status: 'BAD_REQUEST' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR', code?: string) =>
  APIError.from(status, { code: code ?? 'SOMETHING', message: 'x' });

describe('toDomainError', () => {
  it('maps Better Auth organisation codes to ours', () => {
    const mapped = toDomainError(
      apiError('BAD_REQUEST', 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION'),
    );
    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped).toMatchObject({ code: 'ALREADY_A_MEMBER', status: 409 });
  });

  it('keeps our own codes raised from hooks', () => {
    expect(toDomainError(apiError('FORBIDDEN', 'ORG_SUSPENDED'))).toMatchObject({
      code: 'ORG_SUSPENDED',
    });
  });

  it('falls back to the status for other 4xx and leaves 5xx and non-auth errors alone', () => {
    expect(toDomainError(apiError('FORBIDDEN', 'YOU_ARE_NOT_ALLOWED_X'))).toMatchObject({
      code: 'FORBIDDEN',
    });
    const internal = apiError('INTERNAL_SERVER_ERROR');
    expect(toDomainError(internal)).toBe(internal);
    const plain = new Error('boom');
    expect(toDomainError(plain)).toBe(plain);
    expect(authErrorCode(plain)).toBeUndefined();
  });
});
