import * as Sentry from '@sentry/node';

import { loadEnvOrExit } from '@radd/config/env';
import { sentryOptions } from '@radd/config/observability';

// main.ts imports this first: Sentry has to patch the drivers before they load.
// Without a DSN nothing is initialised, so local runs and tests load no instrumentation.
const env = loadEnvOrExit('worker');
if (env.SENTRY_DSN_WORKER) {
  Sentry.init(
    sentryOptions({
      dsn: env.SENTRY_DSN_WORKER,
      release: env.GIT_SHA,
      environment: env.APP_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    }),
  );
}
