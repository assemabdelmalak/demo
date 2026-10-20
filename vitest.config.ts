import { defineConfig } from 'vitest/config';

// Workspace view of every test project, e.g. `pnpm exec vitest --project 'api:*'`.
// Day-to-day runs go through Turborepo: `pnpm test` (unit) and `pnpm test:int` (integration).
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/*/vitest.int.config.ts',
      'apps/*/vitest.config.ts',
      'apps/*/vitest.int.config.ts',
    ],
  },
});
