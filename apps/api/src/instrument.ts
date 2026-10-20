import * as Sentry from '@sentry/nestjs';

import { loadEnvOrExit } from '@radd/config/env';
import { sentryOptions } from '@radd/config/observability';

// main.ts imports this first: Sentry has to patch Nest, Fastify and the drivers before they load.
// Without a DSN nothing is initialised, so local runs and tests load no instrumentation.
const env = loadEnvOrExit('api');
if (env.SENTRY_DSN_API) {
  Sentry.init(
    sentryOptions({
      dsn: env.SENTRY_DSN_API,
      release: env.GIT_SHA,
      environment: env.APP_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    }),
  );
}
