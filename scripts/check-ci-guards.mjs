#!/usr/bin/env node
// Real Anthropic calls cost money and must only happen in the dedicated eval workflow
// (TESTING §3). Fails if any other workflow mentions ANTHROPIC_API_KEY.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../.github/workflows/', import.meta.url).pathname;
const offenders = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file) && !/^eval/.test(file))
  .filter((file) => readFileSync(join(dir, file), 'utf8').includes('ANTHROPIC_API_KEY'));

if (offenders.length > 0) {
  console.error(
    `ANTHROPIC_API_KEY may only be used in eval*.yml workflows; found in: ${offenders.join(', ')}`,
  );
  process.exit(1);
}
console.log('CI guard: ANTHROPIC_API_KEY is confined to eval workflows');
