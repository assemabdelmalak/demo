/** @type {import('lint-staged').Configuration} */
export default {
  // ESLint fixes first, then Prettier, so the committed file is always formatted.
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{json,yml,yaml,css}': ['prettier --write'],
};
