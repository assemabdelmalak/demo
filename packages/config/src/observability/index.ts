import { safeUrl } from '../logging/index.js';

/**
 * Error reporting must not carry diner data (CLAUDE §3.8, SEC §2): no cookies, auth headers,
 * request bodies (chat text, names), query strings or user records. These helpers are plain
 * functions over the shape of a Sentry event so every app shares them and they test without
 * the SDK.
 */
const SAFE_HEADERS = new Set([
  'user-agent',
  'content-type',
  'content-length',
  'origin',
  'x-request-id',
]);

export interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    query_string?: unknown;
    data?: unknown;
  };
  user?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const { request } = event;
  if (request) {
    delete request.cookies;
    delete request.query_string;
    delete request.data;
    const url = safeUrl(request.url);
    if (url === undefined) delete request.url;
    else request.url = url;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
      );
    }
  }
  delete event.user;
  // Breadcrumbs added straight to a scope never pass through beforeBreadcrumb.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter((breadcrumb) => scrubBreadcrumb(breadcrumb));
  }
  return event;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  data?: Record<string, unknown>;
}

const BREADCRUMB_URL_FIELDS = ['url', 'from', 'to'] as const;

/**
 * Console breadcrumbs can hold chat text. HTTP and navigation breadcrumbs keep their path but lose
 * the query and any secret path segment.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  const { data } = breadcrumb;
  if (data) {
    for (const field of BREADCRUMB_URL_FIELDS) {
      const value = data[field];
      if (typeof value === 'string') data[field] = safeUrl(value);
    }
  }
  return breadcrumb;
}

export interface ScrubbableSpan {
  name: string;
  attributes?: Record<string, unknown>;
}

const SPAN_URL_ATTRIBUTES = [
  'url',
  'url.full',
  'url.path',
  'http.url',
  'http.target',
  'sentry.segment.name',
] as const;
const SPAN_DROPPED_ATTRIBUTES = [
  'url.query',
  'url.fragment',
  'http.query',
  'http.fragment',
] as const;

function scrubAttribute(value: unknown): unknown {
  if (typeof value === 'string') return safeUrl(value);
  if (typeof value === 'object' && value !== null && 'value' in value) {
    if (typeof value.value === 'string') return { ...value, value: safeUrl(value.value) };
  }
  return value;
}

/**
 * Spans skip beforeSend: the SDK streams them separately. Names and URL attributes keep their
 * path but lose query strings (signed S3 URLs, tokens) and secret segments such as receipt tokens.
 */
export function scrubSpan<T extends ScrubbableSpan>(span: T): T {
  span.name = safeUrl(span.name) ?? span.name;
  const { attributes } = span;
  if (attributes) {
    for (const key of SPAN_DROPPED_ATTRIBUTES) Reflect.deleteProperty(attributes, key);
    for (const key of SPAN_URL_ATTRIBUTES) {
      if (key in attributes) attributes[key] = scrubAttribute(attributes[key]);
    }
  }
  return span;
}

interface TraceContextClient {
  on(hook: 'createDsc', callback: (context: { transaction?: string }) => void): unknown;
}

/**
 * The trace context in every envelope header (and in `baggage` sent to the API) carries the root
 * span's name, outside both beforeSend and beforeSendSpan.
 */
export function traceContextScrubbing() {
  return {
    name: 'RaddTraceContextScrubbing',
    setup(client: TraceContextClient): void {
      client.on('createDsc', (context) => {
        if (context.transaction !== undefined) context.transaction = safeUrl(context.transaction);
      });
    },
  };
}

export interface SentryRuntimeOptions {
  dsn: string | undefined;
  release: string;
  environment: string;
  /** Server-side performance traces (SENTRY_TRACES_SAMPLE_RATE); browsers pass 0. */
  tracesSampleRate?: number;
  /**
   * Outgoing requests that may carry `sentry-trace`/`baggage` headers. Node SDKs add them to
   * every request by default; third parties (Anthropic, S3, Resend) get none, so only the Next
   * servers list the API here.
   */
  tracePropagationTargets?: string[];
}

/**
 * Shared Sentry options. `enabled` is false without a DSN, so local development and tests send
 * nothing (P0-T09: "env-gated by DSN"). Release is the git SHA (ARCH §12).
 */
export function sentryOptions({
  dsn,
  release,
  environment,
  tracesSampleRate = 0,
  tracePropagationTargets = [],
}: SentryRuntimeOptions) {
  return {
    dsn,
    enabled: Boolean(dsn),
    release,
    environment,
    sendDefaultPii: false,
    tracesSampleRate,
    tracePropagationTargets,
    integrations: [traceContextScrubbing()],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
