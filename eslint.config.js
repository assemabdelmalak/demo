// Lints root-level files, the Playwright suite and repo scripts; each workspace has its own config.
import { defineConfig } from 'eslint/config';

import { base } from '@radd/config/eslint/base';

export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  files: ['scripts/**/*.mjs'],
  rules: { 'no-console': 'off' },
});
