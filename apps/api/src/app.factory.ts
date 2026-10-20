import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { type AppModuleOptions, AppModule } from './app.module';
import { resolveClientIp } from './common/actor';
import { problemTypeBase, toProblem } from './common/problem';
import { sendProblem } from './common/problem.filter';
import { genRequestId, REQUEST_ID_HEADER } from './common/request-id';
import { type ApiEnv } from './config/env.module';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from './idempotency/idempotent.decorator';

export const API_PREFIX = 'v1';

/**
 * Builds the configured Nest/Fastify app without listening. Used by `main.ts`, the integration
 * tests (via `app.inject`) and the OpenAPI generator, so all three see the same global behaviour.
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

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header(REQUEST_ID_HEADER, request.id);
      request.clientIp = resolveClientIp(request, env.CLIENT_IP_HEADER);
      done();
    });

  app.enableCors({
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', REQUEST_ID_HEADER, IDEMPOTENCY_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, IDEMPOTENT_REPLAYED_HEADER, 'retry-after'],
    maxAge: 600,
  });

  // Full CSP with nonces is P10-T01 (ADR-017). Outside production the API serves Swagger UI,
  // which needs inline scripts, so CSP is relaxed there; the JSON API itself is unaffected.
  await app.register(helmet, {
    contentSecurityPolicy: env.APP_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  return app;
}
