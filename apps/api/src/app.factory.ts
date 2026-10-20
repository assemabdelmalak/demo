import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { type AppModuleOptions, AppModule } from './app.module';
import { genRequestId, REQUEST_ID_HEADER } from './common/request-id';
import { type ApiEnv } from './config/env.module';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from './idempotency/idempotent.decorator';

export const API_PREFIX = 'v1';
const DEPLOYED = new Set(['staging', 'production']);

/**
 * Builds the configured Nest/Fastify app without listening. Used by `main.ts`, the integration
 * tests (via `app.inject`) and the OpenAPI generator, so all three see the same global behaviour.
 */
export async function createApp(
  env: ApiEnv,
  options: AppModuleOptions = {},
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    genReqId: genRequestId,
    requestIdHeader: false,
    // Behind Cloudflare + Traefik in deployed environments; trusted only there (SEC §2).
    trustProxy: DEPLOYED.has(env.APP_ENV),
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
