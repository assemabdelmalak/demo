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
import { catchError, finalize, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { DomainError, isUuid } from '@radd/shared';

import { canonicalJson, JsonTooDeepError } from './canonical-json';
import {
  type CompletedRecord,
  IdempotencyStore,
  type IdempotencyOptions,
  type StoredProblem,
  type StoredRecord,
} from './idempotency.store';
import { IDEMPOTENCY_HEADER, IDEMPOTENT, IDEMPOTENT_REPLAYED_HEADER } from './idempotent.decorator';
import { actorKey, resolveActor } from '../common/actor';
import { problemTypeBase, ReplayedProblem, toProblem } from '../common/problem';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { VALKEY } from '../valkey/valkey.module';

export const IDEMPOTENCY_OPTIONS = Symbol('IDEMPOTENCY_OPTIONS');

/** Response headers that belong to the outcome and must come back on a replay. */
const REPLAYED_HEADERS = ['location', 'content-location', 'etag', 'last-modified'] as const;

/**
 * Outcomes that are a property of the request itself and therefore safe to replay. Auth, timeouts
 * and rate limits can change on retry, and 5xx means "try again", so those are never stored.
 */
export function isReplayable(status: number): boolean {
  if (!Number.isInteger(status) || status < 200 || status > 599) return false;
  if (status < 400) return true;
  if (status >= 500) return false;
  return ![401, 403, 408, 429].includes(status);
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly typeBase: string;
  private readonly actorSecret: string;
  private readonly store: IdempotencyStore;

  constructor(
    private readonly reflector: Reflector,
    @Inject(VALKEY) valkey: Redis,
    @Inject(API_ENV) env: ApiEnv,
    @Inject(IDEMPOTENCY_OPTIONS) options: IdempotencyOptions,
  ) {
    this.typeBase = problemTypeBase(env.APP_DOMAIN);
    this.actorSecret = env.ACTOR_HASH_SECRET;
    this.store = new IdempotencyStore(valkey, options);
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
    const storeKey = `idem:${actorKey(resolveActor(request), this.actorSecret)}:${request.method}:${route}:${key}`;
    const fingerprint = this.fingerprint(request);

    return from(this.claim(storeKey, fingerprint)).pipe(
      mergeMap((claim) => {
        if (!claim.claimed) return this.replay(claim.existing, fingerprint, reply);

        const { token } = claim;
        const stopHeartbeat = this.startHeartbeat(storeKey, token);
        return next.handle().pipe(
          mergeMap((body: unknown) =>
            from(this.settleSuccess(storeKey, token, fingerprint, reply, body)).pipe(
              mergeMap(() => of(body)),
            ),
          ),
          catchError((error: unknown) =>
            from(this.settleFailure(storeKey, token, fingerprint, error)).pipe(
              mergeMap(() => throwError(() => error)),
            ),
          ),
          finalize(stopHeartbeat),
        );
      }),
    );
  }

  private fingerprint(request: FastifyRequest): string {
    try {
      return createHash('sha256')
        .update(`${request.method} ${request.url}\n${canonicalJson(request.body)}`)
        .digest('base64url');
    } catch (error) {
      if (error instanceof JsonTooDeepError) {
        throw new DomainError('BAD_REQUEST', { detail: 'Request body is nested too deeply.' });
      }
      throw error;
    }
  }

  private async claim(storeKey: string, fingerprint: string) {
    try {
      return await this.store.claim(storeKey, fingerprint);
    } catch (error) {
      // Fail closed: running a mutation without duplicate protection could double an order.
      this.logger.error({ err: error }, 'idempotency store unavailable');
      throw new DomainError('SERVICE_UNAVAILABLE', { detail: 'Please retry in a moment.' });
    }
  }

  /** Keeps the marker alive for as long as the handler runs, up to `maxHoldMs`. */
  private startHeartbeat(storeKey: string, token: string): () => void {
    const { inFlightTtlMs, maxHoldMs } = this.store.options;
    const startedAt = Date.now();
    const timer = setInterval(
      () => {
        if (Date.now() - startedAt > maxHoldMs) {
          clearInterval(timer);
          return;
        }
        this.store.refresh(storeKey, token).catch((error: unknown) => {
          this.logger.warn({ err: error }, 'could not extend idempotency marker');
        });
      },
      Math.max(50, Math.floor(inFlightTtlMs / 3)),
    );
    timer.unref();
    return () => {
      clearInterval(timer);
    };
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
    for (const [name, value] of Object.entries(existing.headers ?? {}))
      void reply.header(name, value);
    if (existing.problem)
      return throwError(() => new ReplayedProblem((existing as StoredProblem).body));
    void reply.status(existing.status);
    return of(existing.body);
  }

  private async settleSuccess(
    storeKey: string,
    token: string,
    fingerprint: string,
    reply: FastifyReply,
    body: unknown,
  ): Promise<void> {
    const status = reply.statusCode;
    if (!isReplayable(status)) {
      await this.guard('release', () => this.store.release(storeKey, token));
      return;
    }
    const headers: Record<string, string> = {};
    for (const name of REPLAYED_HEADERS) {
      const value = reply.getHeader(name);
      if (typeof value === 'string' || typeof value === 'number') headers[name] = String(value);
    }
    const record: CompletedRecord = { state: 'completed', fingerprint, status, headers, body };
    // A failure here must not fail the response: the mutation already happened.
    await this.guard('complete', () => this.store.complete(storeKey, token, record));
  }

  private async settleFailure(
    storeKey: string,
    token: string,
    fingerprint: string,
    error: unknown,
  ): Promise<void> {
    const problem = toProblem(error, this.typeBase);
    if (!isReplayable(problem.status)) {
      await this.guard('release', () => this.store.release(storeKey, token));
      return;
    }
    const { requestId: _requestId, ...body } = problem;
    const record: CompletedRecord = {
      state: 'completed',
      fingerprint,
      status: problem.status,
      body,
      problem: true,
    };
    await this.guard('complete', () => this.store.complete(storeKey, token, record));
  }

  private async guard(op: string, run: () => Promise<boolean>): Promise<void> {
    try {
      const owned = await run();
      if (!owned) this.logger.warn({ op }, 'idempotency marker no longer owned by this request');
    } catch (error) {
      this.logger.error({ err: error, op }, 'idempotency store write failed');
    }
  }
}
