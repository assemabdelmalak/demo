import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';

import { react } from './react.js';

/**
 * Next.js apps. We use the plugin directly: eslint-config-next pulls in
 * eslint-plugin-react / eslint-plugin-import, which crash on ESLint 10 (ADR-011).
 * @param {{ tsconfigRootDir: string }} options
 */
export function next(options) {
  return defineConfig(react(options), {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [nextPlugin.configs['core-web-vitals']],
  });
}
