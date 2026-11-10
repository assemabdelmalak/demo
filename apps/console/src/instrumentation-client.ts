import { sentryOptions } from '@radd/config/observability';
import { readPublicEnv } from '@radd/config/public-env';

/**
 * Browser error reporting (P0-T09). Next runs this after the HTML has loaded and before
 * hydration, so the runtime public env (ADR-012) is already in the page. The SDK chunk is fetched
 * only when the deployment sets a DSN, so nothing extra is downloaded otherwise. Browsers report
 * errors only; the trace sample rate stays 0. Monitoring must never break the page, so every
 * failure here is swallowed.
 */
function startErrorReporting(): void {
  let env: Record<string, unknown>;
  try {
    env = readPublicEnv();
  } catch {
    return;
  }
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN_CONSOLE;
  if (typeof dsn !== 'string' || dsn === '') return;
  const release = typeof env.GIT_SHA === 'string' ? env.GIT_SHA : 'dev';
  const environment = typeof env.APP_ENV === 'string' ? env.APP_ENV : 'local';
  import('@sentry/nextjs')
    .then(({ init }) => {
      init(sentryOptions({ dsn, release, environment }));
    })
    .catch(() => undefined);
}

startErrorReporting();
