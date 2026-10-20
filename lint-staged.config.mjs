/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx,js,mjs,cjs}': ['prettier --write', 'eslint --fix --no-warn-ignored'],
  '*.{json,yml,yaml,css}': ['prettier --write'],
};
