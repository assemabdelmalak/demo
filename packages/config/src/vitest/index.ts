import swc from 'unplugin-swc';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineProject, type UserWorkspaceConfig } from 'vitest/config';

/** Lets tests import workspace packages straight from `src/` with no prior build (ADR-011). */
export const SOURCE_CONDITION = '@radd/source';

export type TestKind = 'unit' | 'int';

export interface RaddProjectOptions {
  /** Workspace short name, e.g. `api`; the project is named `api:unit` or `api:int`. */
  name: string;
  kind?: TestKind;
  /** NestJS code needs real decorator metadata, which esbuild/oxc do not emit; SWC does. */
  decorators?: boolean;
  environment?: 'node' | 'jsdom';
}

/**
 * Shared Vitest project definition. Unit tests (`*.test.ts`) need no Docker or network;
 * integration tests (`*.int.test.ts`) use Testcontainers and run one file at a time.
 */
export function raddProject({
  name,
  kind = 'unit',
  decorators = false,
  environment = 'node',
}: RaddProjectOptions): UserWorkspaceConfig {
  const integration = kind === 'int';
  return defineProject({
    plugins: decorators ? [swc.vite({ module: { type: 'es6' } })] : [],
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    // Vitest drops `module` for server code: it often selects bundler-only ESM (extensionless
    // imports, e.g. @opentelemetry/api) that Node cannot load. Overriding conditions must keep that.
    ssr: {
      resolve: {
        conditions: [SOURCE_CONDITION, ...defaultServerConditions.filter((c) => c !== 'module')],
      },
    },
    test: {
      name: `${name}:${kind}`,
      environment,
      include: integration
        ? ['{src,test}/**/*.int.test.{ts,tsx}']
        : ['{src,test}/**/*.test.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        ...(integration ? [] : ['**/*.int.test.{ts,tsx}']),
      ],
      testTimeout: integration ? 60_000 : 5_000,
      hookTimeout: integration ? 180_000 : 10_000,
      fileParallelism: !integration,
      restoreMocks: true,
    },
  });
}
