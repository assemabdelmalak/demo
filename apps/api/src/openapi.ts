import 'reflect-metadata';

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { loadEnv } from '@radd/config/env';

import { API_PREFIX } from './app.factory';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/document';

/**
 * `pnpm openapi`: writes the OpenAPI document without connecting to Postgres or Valkey. Preview
 * mode builds the module graph but never instantiates providers, so no connections open.
 * Usage: node dist/openapi.js <path/to/.env.example> <output.json>
 */
async function main(): Promise<void> {
  const [envFile = '../../.env.example', output = '../../packages/api-client/openapi.json'] =
    process.argv.slice(2);
  const env = loadEnv('api', {
    ...parseDotenv(readFileSync(resolve(envFile), 'utf8')),
    LOG_LEVEL: 'silent',
  });
  const app = await NestFactory.create(AppModule.register(env), new FastifyAdapter(), {
    preview: true,
    logger: false,
  });
  app.setGlobalPrefix(API_PREFIX);
  const document = buildOpenApiDocument(app);
  writeFileSync(resolve(output), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  process.stdout.write(`OpenAPI document written to ${resolve(output)}\n`);
}

void main();
