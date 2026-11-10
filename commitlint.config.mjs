/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Co-author and session trailers make long footers routine.
    'footer-max-line-length': [0],
    'body-max-line-length': [0],
  },
};
