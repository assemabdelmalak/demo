import { createHash } from 'node:crypto';

import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Redis } from 'ioredis';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { DomainError, isUuid, type ProblemDetails } from '@radd/shared';

import { canonicalJson } from './canonical-json';
import { IDEMPOTENCY_HEADER, IDEMPOTENT, IDEMPOTENT_REPLAYED_HEADER } from './idempotent.decorator';
import { actorKey, resolveActor } from '../common/actor';
import { problemTypeBase, ReplayedProblem, toProblem } from '../common/problem';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { VALKEY } from '../valkey/valkey.module';

/** How long a completed response is replayed (API §1). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** An in-flight marker outlives any request; it expires on its own if the process dies. */
export const IN_FLIGHT_TTL_MS = 60 * 1000;

type StoredRecord =
  | { state: 'in_flight'; fingerprint: string }
  | { state: 'completed'; fingerprint: string; status: number; body: unknown; problem?: false }
  | {
      state: 'completed';
      fingerprint: string;
      status: number;
      body: ProblemDetails;
      problem: true;
    };

/**
 * Outcomes that are a property of the request itself and therefore safe to replay. Auth, timeouts
 * and rate limits can change on retry, and 5xx means "try again", so those are never stored.
 */
function isReplayable(status: number): boolean {
  if (status < 400) return true;
  if (status >= 500) return false;
  return ![401, 403, 408, 429].includes(status);
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly typeBase: string;

  constructor(
    private readonly reflector: Reflector,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.typeBase = problemTypeBase(env.APP_DOMAIN);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const idempotent = this.reflector.getAllAndOverride<boolean | undefined>(IDEMPOTENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!idempotent || context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const key = request.headers[IDEMPOTENCY_HEADER];
    if (!isUuid(key)) {
      throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', {
        detail:
          'Send a UUID in the Idempotency-Key header; reuse it only to retry the same request.',
      });
    }

    const route = request.routeOptions.url ?? request.url;
    const storeKey = `idem:${actorKey(resolveActor(request))}:${request.method}:${route}:${key}`;
    const fingerprint = createHash('sha256')
      .update(`${request.method} ${request.url}\n${canonicalJson(request.body ?? null)}`)
      .digest('base64url');

    return from(this.claim(storeKey, fingerprint)).pipe(
      mergeMap((existing) => {
        if (existing) return this.replay(existing, fingerprint, reply);
        return next.handle().pipe(
          mergeMap((body: unknown) =>
            from(
              this.complete(storeKey, {
                state: 'completed',
                fingerprint,
                status: reply.statusCode,
                body,
              }),
            ).pipe(mergeMap(() => of(body))),
          ),
          catchError((error: unknown) =>
            from(this.fail(storeKey, fingerprint, error)).pipe(
              mergeMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }

  /** Atomically claims the key; returns the existing record when another request got there first. */
  private async claim(
    storeKey: string,
    fingerprint: string,
    attempt = 0,
  ): Promise<StoredRecord | undefined> {
    try {
      const marker: StoredRecord = { state: 'in_flight', fingerprint };
      const claimed = await this.valkey.set(
        storeKey,
        JSON.stringify(marker),
        'PX',
        IN_FLIGHT_TTL_MS,
        'NX',
      );
      if (claimed === 'OK') return undefined;
      const raw = await this.valkey.get(storeKey);
      // Expired between SET and GET: claim again rather than guess.
      if (raw === null && attempt < 2) return await this.claim(storeKey, fingerprint, attempt + 1);
      if (raw === null) throw new Error('idempotency key kept expiring while being claimed');
      return JSON.parse(raw) as StoredRecord;
    } catch (error) {
      // Fail closed: running a mutation without duplicate protection could double an order.
      this.logger.error({ err: error }, 'idempotency store unavailable');
      throw new DomainError('SERVICE_UNAVAILABLE', { detail: 'Please retry in a moment.' });
    }
  }

  private replay(
    existing: StoredRecord,
    fingerprint: string,
    reply: FastifyReply,
  ): Observable<unknown> {
    if (existing.fingerprint !== fingerprint) {
      return throwError(() => new DomainError('IDEMPOTENCY_MISMATCH'));
    }
    if (existing.state === 'in_flight') {
      void reply.header('retry-after', '1');
      return throwError(() => new DomainError('IDEMPOTENCY_IN_PROGRESS'));
    }
    void reply.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
    if (existing.problem) return throwError(() => new ReplayedProblem(existing.body));
    void reply.status(existing.status);
    return of(existing.body);
  }

  private async complete(storeKey: string, record: StoredRecord): Promise<void> {
    try {
      await this.valkey.set(storeKey, JSON.stringify(record), 'PX', IDEMPOTENCY_TTL_MS);
    } catch (error) {
      // The mutation already happened; failing the response now would invite a duplicate retry.
      this.logger.error({ err: error }, 'could not store idempotent response');
    }
  }

  private async fail(storeKey: string, fingerprint: string, error: unknown): Promise<void> {
    const problem = toProblem(error, this.typeBase);
    try {
      if (isReplayable(problem.status)) {
        const { requestId: _requestId, ...body } = problem;
        await this.valkey.set(
          storeKey,
          JSON.stringify({
            state: 'completed',
            fingerprint,
            status: problem.status,
            body,
            problem: true,
          }),
          'PX',
          IDEMPOTENCY_TTL_MS,
        );
      } else {
        await this.valkey.del(storeKey);
      }
    } catch (storeError) {
      this.logger.error({ err: storeError }, 'could not record idempotent failure');
    }
  }
}
