#!/usr/bin/env node
// Every Next app's message catalogues must match key for key (TESTING §4 "i18n and RTL"):
// `en` is the reference, `ar` must have exactly the same keys, and `fr` (a stub until the French
// UI ships) may be partial but must not contain keys English lacks. Exits 1 on any mismatch.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function keys(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const load = (file) => new Set(keys(JSON.parse(readFileSync(file, 'utf8'))));
const problems = [];
const apps = readdirSync(join(root, 'apps')).filter((app) =>
  existsSync(join(root, 'apps', app, 'messages', 'en.json')),
);

for (const app of apps) {
  const dir = join(root, 'apps', app, 'messages');
  const en = load(join(dir, 'en.json'));
  const ar = load(join(dir, 'ar.json'));
  for (const key of en) if (!ar.has(key)) problems.push(`${app}: ar.json is missing "${key}"`);
  for (const key of ar)
    if (!en.has(key)) problems.push(`${app}: en.json is missing "${key}" (present in ar.json)`);
  if (existsSync(join(dir, 'fr.json'))) {
    for (const key of load(join(dir, 'fr.json')))
      if (!en.has(key)) problems.push(`${app}: fr.json has unknown key "${key}"`);
  }
}

if (problems.length > 0) {
  console.error(
    `Message catalogues are out of sync:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`i18n catalogues in sync for: ${apps.join(', ')}`);
