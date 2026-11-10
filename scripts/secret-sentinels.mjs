#!/usr/bin/env node
// P0-T02: prints `NAME=value` for every server-only secret named in .env.example, each value a
// unique sentinel. CI appends the output to $GITHUB_ENV before the build, then
// check-client-bundles.mjs fails if a sentinel reached a browser bundle. The list comes from
// .env.example, so a secret added there later is covered without touching the workflow.
import { readFileSync } from 'node:fs';

const SENTINEL = 'RADD_SECRET_SENTINEL';
const SECRET_NAME = /SECRET|TOKEN|API_KEY|PASSWORD/;
// Connection strings carry a password, so the sentinel sits where the password would be.
const SECRET_URLS = { DATABASE_URL: 'postgres', REDIS_URL: 'redis', SMTP_URL: 'smtp' };
// A value here would make the build try to upload source maps.
const BUILD_CREDENTIALS = new Set(['SENTRY_AUTH_TOKEN']);

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const names = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);

const lines = [];
for (const name of new Set(names)) {
  if (name.startsWith('NEXT_PUBLIC_') || BUILD_CREDENTIALS.has(name)) continue;
  const sentinel = `${SENTINEL}_${name.toLowerCase()}`;
  const urlKind = Object.keys(SECRET_URLS).find(
    (key) => name === key || name.startsWith(`${key}_`),
  );
  if (urlKind) lines.push(`${name}=${SECRET_URLS[urlKind]}://u:${sentinel}@localhost:1/radd`);
  else if (SECRET_NAME.test(name)) lines.push(`${name}=${sentinel}`);
}

if (lines.length === 0) {
  console.error('No secrets found in .env.example; the client-bundle check would prove nothing');
  process.exit(1);
}
console.log(lines.join('\n'));
