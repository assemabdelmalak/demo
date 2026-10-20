import { z } from 'zod';

import {
  appEnv,
  bool,
  csv,
  optionalString,
  optionalUrl,
  port,
  positiveInt,
  refineSecrets,
  requiredString,
  sampleRate,
  url,
} from './helpers.js';

// Variable names and defaults mirror `.env.example`. Anything `.env.example` leaves empty is optional.

const common = {
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: appEnv.default('local'),
  APP_DOMAIN: z.string().min(1).default('localhost'),
  GIT_SHA: z.string().min(1).default('dev'),
  APP_VERSION: z.string().min(1).default('0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_TRACES_SAMPLE_RATE: sampleRate.default(0),
};

const publicUrls = {
  DINER_PUBLIC_URL: url,
  CONSOLE_PUBLIC_URL: url,
  API_PUBLIC_URL: url,
  CDN_PUBLIC_URL: url,
};

const database = {
  DATABASE_URL: url,
  DATABASE_POOL_MAX: positiveInt.default(20),
};

const valkey = {
  REDIS_URL: url,
};

const storage = {
  S3_ENDPOINT: url,
  S3_REGION: z.string().min(1).default('auto'),
  S3_ACCESS_KEY_ID: requiredString,
  S3_SECRET_ACCESS_KEY: requiredString,
  S3_BUCKET_PUBLIC: requiredString,
  S3_BUCKET_PRIVATE: requiredString,
  S3_FORCE_PATH_STYLE: bool.default(false),
};

const ai = {
  AI_ENABLED: bool.default(true),
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL_CHAT: requiredString,
  AI_MODEL_CLASSIFY: requiredString,
  AI_MODEL_IMPORT: requiredString,
  AI_MODEL_IMPORT_FALLBACK: requiredString,
  AI_MODEL_TRANSLATE: requiredString,
  AI_MODEL_ALLERGEN_SUGGEST: requiredString,
  AI_MODEL_INSIGHTS_CLASSIFY: requiredString,
  AI_MODEL_INSIGHTS_SUMMARY: requiredString,
  AI_CHAT_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  AI_CACHE_TTL: z.enum(['5m', '1h']).default('5m'),
  AI_MONTHLY_BUDGET_USD: positiveInt.default(100),
  LANGFUSE_PUBLIC_KEY: optionalString,
  LANGFUSE_SECRET_KEY: optionalString,
  LANGFUSE_HOST: optionalUrl,
};

const mail = {
  MAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  SMTP_URL: optionalUrl,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: requiredString,
};

const whatsapp = {
  WHATSAPP_ENABLED: bool.default(false),
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_GRAPH_VERSION: z.string().min(1).default('v23.0'),
};

const API_SECRET_KEYS = [
  'BETTER_AUTH_SECRET',
  'PARTICIPANT_TOKEN_SECRET',
  'DEVICE_COOKIE_SECRET',
  'RECEIPT_TOKEN_SECRET',
  'DINER_REVALIDATE_SECRET',
  'ACTOR_HASH_SECRET',
] as const;

export const apiEnvSchema = z
  .object({
    ...common,
    ...publicUrls,
    ...database,
    DATABASE_URL_ADMIN: url,
    ...valkey,
    ...storage,
    ...ai,
    ...mail,
    ...whatsapp,
    API_PORT: port.default(4000),
    /**
     * Header the edge proxy sets to the real client IP (`cf-connecting-ip` behind Cloudflare).
     * Unset: use the socket address. Forwarding headers are never trusted otherwise (ADR-016).
     */
    CLIENT_IP_HEADER: z.preprocess(
      (value) =>
        value === '' ? undefined : typeof value === 'string' ? value.toLowerCase() : value,
      z
        .string()
        .regex(/^[a-z0-9-]+$/, 'must be an HTTP header name')
        .optional(),
    ),
    /** Keys the HMAC that turns IPs and IDs into Valkey key fragments. */
    ACTOR_HASH_SECRET: requiredString,
    BETTER_AUTH_SECRET: requiredString,
    BETTER_AUTH_URL: url,
    AUTH_COOKIE_DOMAIN: requiredString,
    TRUSTED_ORIGINS: csv(z.url(), { min: 1 }),
    PARTICIPANT_TOKEN_SECRET: requiredString,
    DEVICE_COOKIE_SECRET: requiredString,
    RECEIPT_TOKEN_SECRET: requiredString,
    DINER_REVALIDATE_SECRET: requiredString,
    SUPER_ADMIN_EMAILS: csv(z.email()),
    SENTRY_DSN_API: optionalUrl,
    CLOUDFLARE_API_TOKEN: optionalString,
    CLOUDFLARE_ZONE_ID: optionalString,
  })
  .superRefine(refineSecrets(API_SECRET_KEYS));

export const workerEnvSchema = z.object({
  ...common,
  ...publicUrls,
  ...database,
  ...valkey,
  ...storage,
  ...ai,
  ...mail,
  ...whatsapp,
  WORKER_HEALTH_PORT: port.default(4100),
  SENTRY_DSN_WORKER: optionalUrl,
});

/**
 * Browser-safe values. Read on the server at request time and handed to the client,
 * so one Docker image serves every environment (ADR-012). Nothing else may reach the browser.
 */
export const dinerPublicEnvSchema = z.object({
  APP_ENV: common.APP_ENV,
  GIT_SHA: common.GIT_SHA,
  NEXT_PUBLIC_API_URL: url,
  NEXT_PUBLIC_CDN_URL: url,
  NEXT_PUBLIC_SENTRY_DSN_DINER: optionalUrl,
});

export const consolePublicEnvSchema = z.object({
  APP_ENV: common.APP_ENV,
  GIT_SHA: common.GIT_SHA,
  NEXT_PUBLIC_API_URL: url,
  NEXT_PUBLIC_CDN_URL: url,
  NEXT_PUBLIC_SENTRY_DSN_CONSOLE: optionalUrl,
});

export const dinerEnvSchema = z
  .object({
    ...common,
    ...publicUrls,
    ...dinerPublicEnvSchema.shape,
    DINER_REVALIDATE_SECRET: requiredString,
  })
  .superRefine(refineSecrets(['DINER_REVALIDATE_SECRET']));

export const consoleEnvSchema = z.object({
  ...common,
  ...publicUrls,
  ...consolePublicEnvSchema.shape,
});

export const envSchemas = {
  api: apiEnvSchema,
  worker: workerEnvSchema,
  diner: dinerEnvSchema,
  console: consoleEnvSchema,
} as const;

export const publicEnvSchemas = {
  diner: dinerPublicEnvSchema,
  console: consolePublicEnvSchema,
} as const;

export type AppName = keyof typeof envSchemas;
export type WebAppName = keyof typeof publicEnvSchemas;
export type Env<A extends AppName> = z.infer<(typeof envSchemas)[A]>;
export type PublicEnv<A extends WebAppName> = z.infer<(typeof publicEnvSchemas)[A]>;
