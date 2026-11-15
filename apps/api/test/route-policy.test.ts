import 'reflect-metadata';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isAction } from '@radd/shared';

import { testEnv } from './support/env';
import { AppModule } from '../src/app.module';
import { accessPolicyOf, type AccessPolicy } from '../src/authz/access.decorators';

interface RouteHandler {
  name: string;
  policy: AccessPolicy | undefined;
}

/**
 * Every route handler in the production module graph. Preview mode builds the graph without
 * instantiating providers, so nothing connects to Postgres or Valkey (as `pnpm openapi` does).
 */
async function collectRoutes(): Promise<RouteHandler[]> {
  const app = await NestFactory.create(AppModule.register(testEnv()), new FastifyAdapter(), {
    preview: true,
    logger: false,
  });
  try {
    const scanner = new MetadataScanner();
    const routes: RouteHandler[] = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
        if (!controller) continue;
        const prototype = controller.prototype as Record<string, unknown>;
        for (const methodName of scanner.getAllMethodNames(prototype)) {
          const handler = prototype[methodName];
          if (typeof handler !== 'function') continue;
          // The same test Nest's router uses to decide a method is a route.
          if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          routes.push({
            name: `${controller.name}.${methodName}`,
            policy: accessPolicyOf(handler, controller),
          });
        }
      }
    }
    return routes;
  } finally {
    await app.close();
  }
}

describe('route access policies (ADR-024)', () => {
  let routes: RouteHandler[];

  beforeAll(async () => {
    routes = await collectRoutes();
  });

  afterAll(() => {
    routes = [];
  });

  it('finds the API routes', () => {
    const names = routes.map((route) => route.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'MeController.me',
        'OrganizationsController.update',
        'RestaurantsController.read',
        'HealthController.live',
      ]),
    );
  });

  it('declares @Public, @AuthenticatedOnly or @RequirePermission on every route', () => {
    const undeclared = routes.filter((route) => route.policy === undefined).map((r) => r.name);
    expect(undeclared, `routes without an access policy: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('names only known actions in @RequirePermission', () => {
    const unknown = routes
      .filter((route) => route.policy?.kind === 'permission' && !isAction(route.policy.action))
      .map((route) => route.name);
    expect(unknown).toEqual([]);
  });

  it('keeps public routes to the known few', () => {
    const publicRoutes = routes.filter((route) => route.policy?.kind === 'public');
    expect(publicRoutes.map((route) => route.name).sort()).toEqual([
      'HealthController.live',
      'HealthController.ready',
    ]);
  });
});
