import { safeUrl } from '../logging/index.js';

import type { Options } from '@sentry/core';

/**
 * Error reporting must not carry diner data (CLAUDE §3.8, SEC §2): no cookies, auth headers,
 * IP addresses, request bodies (chat text, names), query strings or user records. Two layers:
 * `DATA_COLLECTION` stops the SDK collecting it at all, and the scrubbers below remove anything
 * that still reaches an event, span or breadcrumb. They are plain functions over the shape of
 * Sentry's payloads, so every app shares them and they test without a network.
 */
const SAFE_HEADERS = ['user-agent', 'content-type', 'content-length', 'origin', 'x-request-id'];
const SAFE_HEADER_SET = new Set(SAFE_HEADERS);

/**
 * SDK 11 replaced `sendDefaultPii` with `dataCollection`, whose defaults collect everything,
 * including the user's IP (Relay infers it unless told not to), cookies, bodies and AI prompts.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: SAFE_HEADERS }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies Options['dataCollection'];

export interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    query_string?: unknown;
    data?: unknown;
  };
  user?: unknown;
  transaction?: string;
  contexts?: Record<string, Record<string, unknown> | undefined>;
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
        Object.entries(request.headers).filter(([name]) => SAFE_HEADER_SET.has(name.toLowerCase())),
      );
    }
  }
  delete event.user;
  // Before a route is matched the transaction is the raw path; Next's onRequestError adds the
  // raw path and query as contexts.nextjs.request_path.
  if (event.transaction !== undefined) event.transaction = safeUrl(event.transaction);
  const nextjs = event.contexts?.nextjs;
  if (typeof nextjs?.request_path === 'string') nextjs.request_path = safeUrl(nextjs.request_path);
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
// SDK 11 keeps an outgoing request's query and fragment apart from `url`.
const BREADCRUMB_DROPPED_FIELDS = ['url.query', 'url.fragment', 'http.query', 'http.fragment'];

/**
 * Console breadcrumbs can hold chat text. HTTP and navigation breadcrumbs keep their path but lose
 * the query and any secret path segment.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  const { data } = breadcrumb;
  if (data) {
    for (const field of BREADCRUMB_DROPPED_FIELDS) Reflect.deleteProperty(data, field);
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

const SPAN_URL_ATTRIBUTES = new Set([
  'url',
  'url.full',
  'url.path',
  'http.url',
  'http.target',
  'sentry.segment.name',
]);

/** Attributes that carry people's data or free text; anything matching is dropped. */
const SPAN_DROPPED_ATTRIBUTES = [
  /^(url|http)\.(query|fragment)$/,
  /^http\.(request|response)\.body(\.|$)/,
  /^(client|source|network\.peer)\.(address|port)$/,
  /^user\./,
  /^db\.query\.parameter\./,
  /^messaging\.message\.body/,
];
const SPAN_HEADER_ATTRIBUTE = /^http\.(?:request|response)\.header\.(.+)$/;
// Generative-AI spans keep model and usage metadata, never prompts, outputs or tool arguments.
const GEN_AI_KEPT =
  /^gen_ai\.(usage\.|system$|provider\.name$|operation\.name$|(request|response)\.model$|response\.(id|finish_reasons)$|request\.(max_tokens|temperature|top_p)$|tool\.name$|agent\.name$)/;
// Valkey/Redis statements carry every argument, e.g. idempotency records and job payloads.
const STATEMENT_ATTRIBUTES = ['db.query.text', 'db.statement'];

/** Attribute values arrive raw or wrapped as `{ value, type }`. */
function attributeText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null && 'value' in raw && typeof raw.value === 'string') {
    return raw.value;
  }
  return undefined;
}

function withText(raw: unknown, text: string | undefined): unknown {
  if (typeof raw === 'object' && raw !== null && 'value' in raw) return { ...raw, value: text };
  return text;
}

function isDropped(key: string): boolean {
  if (SPAN_DROPPED_ATTRIBUTES.some((pattern) => pattern.test(key))) return true;
  const header = SPAN_HEADER_ATTRIBUTE.exec(key)?.[1];
  if (header !== undefined) return !SAFE_HEADER_SET.has(header.toLowerCase());
  return key.startsWith('gen_ai.') && !GEN_AI_KEPT.test(key);
}

const commandOnly = (statement: string) => statement.trim().split(/\s+/, 1)[0] ?? '';

/**
 * Spans skip beforeSend: the SDK streams them separately. Names and URL attributes keep their
 * path but lose query strings (signed S3 URLs, tokens) and secret segments such as receipt tokens;
 * bodies, IPs, users, unsafe headers, AI content and Redis arguments are dropped.
 */
export function scrubSpan<T extends ScrubbableSpan>(span: T): T {
  const { attributes } = span;
  const system = attributeText(attributes?.['db.system.name'] ?? attributes?.['db.system']);
  const redis = system === 'redis';
  span.name = redis ? commandOnly(span.name) : (safeUrl(span.name) ?? span.name);
  if (attributes) {
    for (const key of Object.keys(attributes)) {
      if (isDropped(key)) {
        Reflect.deleteProperty(attributes, key);
      } else if (SPAN_URL_ATTRIBUTES.has(key)) {
        const text = attributeText(attributes[key]);
        if (text !== undefined) attributes[key] = withText(attributes[key], safeUrl(text));
      } else if (redis && STATEMENT_ATTRIBUTES.includes(key)) {
        const text = attributeText(attributes[key]);
        if (text !== undefined) attributes[key] = withText(attributes[key], commandOnly(text));
      }
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
  /** Servers: decides from the request ID (`requestIdSampler` in `@radd/shared/node`). */
  keepRequestId?: (requestId: string) => boolean;
}

/** The part of the SDK's per-request data the sampler reads; headers already carry the request ID. */
interface SampledRequest {
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Trace sampling decided here, never by the client. Continuing an incoming trace, the SDK honours
 * `sentry-trace: …-1` and compares a rate against the random number in the client's `baggage`, so
 * returning a rate would let any client trace (and spend the span quota on) all its requests.
 * Returning only 0 or 1 makes both irrelevant. One decision per incoming request, shared by all
 * its root spans (a Next.js request has several), keeps each request's trace whole. With
 * `keepRequestId` the decision comes from the request ID, so the Next servers and the API agree
 * on the same request; otherwise, and for work outside a request such as a worker job, it is a
 * local draw. Kept spans report a sample rate of 1, so percentiles are right but throughput counts
 * are not extrapolated.
 */
export function requestSampler(rate: number, keepRequestId?: (requestId: string) => boolean) {
  const decisions = new WeakMap<object, boolean>();
  const draw = () => Math.random() < rate;
  return ({ normalizedRequest }: { normalizedRequest?: SampledRequest }): 0 | 1 => {
    if (normalizedRequest === undefined) return draw() ? 1 : 0;
    let keep = decisions.get(normalizedRequest);
    if (keep === undefined) {
      const requestId = normalizedRequest.headers?.['x-request-id'];
      keep = keepRequestId && typeof requestId === 'string' ? keepRequestId(requestId) : draw();
      decisions.set(normalizedRequest, keep);
    }
    return keep ? 1 : 0;
  };
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
  keepRequestId,
}: SentryRuntimeOptions) {
  return {
    dsn,
    enabled: Boolean(dsn),
    release,
    environment,
    dataCollection: DATA_COLLECTION,
    tracesSampler: requestSampler(tracesSampleRate, keepRequestId),
    // No service sends `sentry-trace`/`baggage` to another: the API cannot tell our Next servers
    // from a client forging them, and third parties (Anthropic, S3, Resend) must get none. A page
    // request and the API calls it makes share the `x-request-id` kept on their spans and events.
    tracePropagationTargets: [],
    integrations: [traceContextScrubbing()],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies Options;
}
