#!/usr/bin/env node
// P0-T02: secrets must never reach browser bundles. CI builds with every server-only variable set
// to a unique sentinel (see ci.yml `build`), then this scans the client output of each Next app.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SENTINEL = process.argv[2] ?? 'RADD_SECRET_SENTINEL';
const root = new URL('..', import.meta.url).pathname;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const offenders = [];
let scanned = 0;
for (const app of ['diner', 'console']) {
  const dir = join(root, 'apps', app, '.next', 'static');
  if (!existsSync(dir)) {
    console.error(`apps/${app}/.next/static is missing; build the app first`);
    process.exit(1);
  }
  for (const file of files(dir)) {
    scanned += 1;
    if (readFileSync(file, 'utf8').includes(SENTINEL)) offenders.push(file.replace(root, ''));
  }
}

if (offenders.length > 0) {
  console.error(
    `Server secrets found in client bundles:\n${offenders.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`No secrets in ${String(scanned)} client bundle files`);
