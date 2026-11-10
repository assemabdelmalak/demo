import { type ArgumentsHost, Logger } from '@nestjs/common';
import { captureException } from '@sentry/nestjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@radd/shared';

import { ProblemDetailsFilter } from './problem.filter';
import { type ApiEnv } from '../config/env.module';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

const REQUEST_ID = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';

function host(route: string | undefined): { host: ArgumentsHost; sent: () => unknown } {
  let body: unknown;
  const reply = {
    status: () => reply,
    header: () => reply,
    send: (payload: unknown) => {
      body = payload;
      return reply;
    },
  };
  const request = { id: REQUEST_ID, routeOptions: { url: route } };
  const http = { getRequest: () => request, getResponse: () => reply };
  return { host: { switchToHttp: () => http } as unknown as ArgumentsHost, sent: () => body };
}

describe('ProblemDetailsFilter error reporting', () => {
  const filter = new ProblemDetailsFilter({ APP_DOMAIN: 'localhost' } as ApiEnv);

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('reports a server fault with the request ID and route, never the response body', () => {
    const error = new Error('database unavailable');
    const { host: ctx, sent } = host('/v1/menus/:id');
    filter.catch(error, ctx);

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { requestId: REQUEST_ID, route: '/v1/menus/:id' },
    });
    expect(sent()).toMatchObject({ status: 500, code: 'INTERNAL', requestId: REQUEST_ID });
  });

  it('tags errors outside any route as unmatched', () => {
    filter.catch(new Error('boom'), host(undefined).host);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { requestId: REQUEST_ID, route: 'unmatched' },
    });
  });

  it('does not report expected client errors', () => {
    filter.catch(new DomainError('ITEM_UNAVAILABLE'), host('/v1/items/:id').host);
    filter.catch(new DomainError('VALIDATION_FAILED'), host('/v1/items').host);
    expect(captureException).not.toHaveBeenCalled();
  });
});
