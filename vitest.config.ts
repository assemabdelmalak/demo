import { defineConfig } from 'vitest/config';

// Workspace view of every test project, e.g. `pnpm exec vitest --project 'api:*'`.
// Day-to-day runs go through Turborepo: `pnpm test` (unit) and `pnpm test:int` (integration).
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.{ts,mts}',
      'packages/*/vitest.int.config.{ts,mts}',
      'apps/*/vitest.config.{ts,mts}',
      'apps/*/vitest.int.config.{ts,mts}',
    ],
  },
});
