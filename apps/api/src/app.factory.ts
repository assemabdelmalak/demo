import helmet from '@fastify/helmet';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { QUEUE_NAMES } from '@radd/shared';

import { registerBullBoard } from './admin/bull-board';
import { type AppModuleOptions, AppModule } from './app.module';
import { type AuthRateLimitStorage } from './auth/auth-rate-limit';
import { type Auth } from './auth/auth.config';
import { registerAuth } from './auth/auth.fastify';
import { AUTH, AUTH_OPTIONS, AUTH_RATE_LIMITER, type AuthModuleOptions } from './auth/auth.module';
import { authUrlParts, LOCALE_HEADER } from './auth/auth.utils';
import { PinSessionGate } from './auth/pin-session';
import { resolveClientIp } from './common/actor';
import { problemTypeBase, toProblem } from './common/problem';
import { sendProblem } from './common/problem.filter';
import { genRequestId, REQUEST_ID_HEADER } from './common/request-id';
import { type ApiEnv } from './config/env.module';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from './idempotency/idempotent.decorator';
import { buildOpenApiDocument, DOCS_PATH } from './openapi/document';
import { QueueProducer } from './queues/queue-producer';

export const API_PREFIX = 'v1';

/**
 * Builds the configured Nest/Fastify app without listening. Used by `main.ts` and the integration
 * tests (via `app.inject`), so both see the same global behaviour.
 */
export async function createApp(
  env: ApiEnv,
  options: AppModuleOptions = {},
): Promise<NestFastifyApplication> {
  const typeBase = problemTypeBase(env.APP_DOMAIN);
  const adapter = new FastifyAdapter({
    genReqId: genRequestId,
    // Router-level failures (bad percent-encoding, overlong params) happen before Nest sees the
    // request; answer them in the same problem+json shape with the request ID.
    frameworkErrors: (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      sendProblem(reply, request, toProblem(error, typeBase), typeBase);
    },
    requestIdHeader: false,
    // X-Forwarded-For is client-controlled; the client IP comes from CLIENT_IP_HEADER (ADR-016).
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env, options),
    adapter,
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    request.clientIp = resolveClientIp(request, env.CLIENT_IP_HEADER);
    done();
  });

  // After the client-IP hook: the auth bridge forwards `request.clientIp`, and its session hook
  // must set `request.principal` before the global throttler guard reads it (ADR-016).
  await registerAuth(fastify, app.get<Auth>(AUTH), env, {
    limiter: app.get<AuthRateLimitStorage>(AUTH_RATE_LIMITER),
    codeRequestLimit: app.get<Required<AuthModuleOptions>>(AUTH_OPTIONS).codeRequestLimit,
    logger: new NestLogger('AuthBridge'),
    pinSessions: app.get(PinSessionGate),
  });

  // After the auth bridge: its root hook resolves the session this plugin's guard reads (ADR-027).
  const queues = app.get(QueueProducer);
  await registerBullBoard(fastify, {
    queues: QUEUE_NAMES.map((name) => queues.queue(name)),
    allowlist: env.SUPER_ADMIN_EMAILS,
    apiOrigin: authUrlParts(env.BETTER_AUTH_URL).origin,
    typeBase,
  });

  app.enableCors({
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'content-type',
      'authorization',
      REQUEST_ID_HEADER,
      IDEMPOTENCY_HEADER,
      LOCALE_HEADER,
    ],
    exposedHeaders: [REQUEST_ID_HEADER, IDEMPOTENT_REPLAYED_HEADER, 'retry-after'],
    maxAge: 600,
  });

  // Full CSP with nonces is P10-T01 (ADR-017). Outside production the API serves Swagger UI,
  // which needs inline scripts, so CSP is relaxed there; the JSON API itself is unaffected.
  await app.register(helmet, {
    contentSecurityPolicy: env.APP_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // Interactive docs outside production only (P0-T04); `pnpm openapi` exports the same document.
  if (env.APP_ENV !== 'production') {
    SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
      jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    });
  }

  return app;
}
