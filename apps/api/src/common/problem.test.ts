import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { DomainError } from '@radd/shared';

import { problemTypeBase, ReplayedProblem, toProblem } from './problem';

const base = problemTypeBase('raddmenu.test');

describe('toProblem', () => {
  it('maps a DomainError with its catalogue status, detail, field errors and extensions', () => {
    const problem = toProblem(
      new DomainError('PRICE_CHANGED', {
        detail: 'Prices changed since you added these items',
        errors: [{ path: 'items.0', message: 'was 650, now 700' }],
        extensions: { diff: [{ itemId: 'x', before: 650, after: 700 }] },
      }),
      base,
    );
    expect(problem).toEqual({
      type: 'https://docs.raddmenu.test/errors/PRICE_CHANGED',
      title: 'Prices changed',
      status: 409,
      code: 'PRICE_CHANGED',
      detail: 'Prices changed since you added these items',
      errors: [{ path: 'items.0', message: 'was 650, now 700' }],
      diff: [{ itemId: 'x', before: 650, after: 700 }],
    });
  });

  it('maps Nest HTTP exceptions to generic codes', () => {
    expect(toProblem(new NotFoundException('Cannot GET /v1/x'), base)).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Cannot GET /v1/x',
    });
    expect(toProblem(new BadRequestException('bad'), base)).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
    expect(toProblem(new ThrottlerException(), base)).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('never exposes messages of server errors', () => {
    const fromHttp = toProblem(new InternalServerErrorException('db password is hunter2'), base);
    const fromPlain = toProblem(new Error('db password is hunter2'), base);
    for (const problem of [fromHttp, fromPlain]) {
      expect(problem).toMatchObject({ status: 500, code: 'INTERNAL' });
      expect(JSON.stringify(problem)).not.toContain('hunter2');
    }
  });

  it('maps Fastify client errors that carry a statusCode', () => {
    const error = Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    expect(toProblem(error, base)).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('returns replayed problems unchanged', () => {
    const stored = toProblem(new DomainError('ITEM_UNAVAILABLE'), base);
    expect(toProblem(new ReplayedProblem(stored), base)).toEqual(stored);
  });
});
