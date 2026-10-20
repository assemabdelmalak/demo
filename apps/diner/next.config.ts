import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withSentryConfig } from '@sentry/nextjs/config';
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

const withIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Browser source maps are generated and uploaded only when the image build receives
// SENTRY_AUTH_TOKEN as a BuildKit secret (docker.yml, default branch). They are deleted after
// upload, so they never ship; without the token the build needs no Sentry access at all. Sentry
// releases are created at deploy time, not here (DEPLOYMENT §5).
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(withIntl(config), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  telemetry: false,
  silent: !sentryAuthToken,
  sourcemaps: { disable: !sentryAuthToken, deleteSourcemapsAfterUpload: true },
  // Only reached when uploading. A failed upload must fail the build: otherwise the image layer is
  // cached without maps and later builds of the same sources never retry.
  errorHandler: (error) => {
    throw error;
  },
  release: { create: false },
  widenClientFileUpload: true,
  // Only browser tracing reads it, and browsers report errors only.
  routeManifestInjection: false,
  // Browsers report errors only, so navigations are not traced (ADR-019).
  suppressOnRouterTransitionStartWarning: true,
});
