import { defineConfig } from 'eslint/config';

import { base } from './base.js';

/**
 * NestJS apps. Constructor-injected classes must stay value imports: with
 * emitDecoratorMetadata a type-only import erases the DI token to `Object`.
 * @param {{ tsconfigRootDir: string }} options
 */
export function nest(options) {
  return defineConfig(base(options), {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/parameter-properties': 'off',
    },
  });
}
