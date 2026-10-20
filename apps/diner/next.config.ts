import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Local development reads the monorepo's root .env (`next dev` re-evaluates this file in its
// server process). `pnpm start` passes it with --env-file; deployed containers get real env vars.
const rootEnv = path.join(root, '.env');
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Baseline headers; full CSP with nonces arrives in P10-T01 (ADR-017). */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  reactStrictMode: true,
  poweredByHeader: false,
  headers: () => Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]),
};

export default createNextIntlPlugin('./src/i18n/request.ts')(config);
