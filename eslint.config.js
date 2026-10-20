// Lints root-level files only; each workspace has its own eslint.config.js.
import { base } from '@radd/config/eslint/base';

export default base({ tsconfigRootDir: import.meta.dirname });
