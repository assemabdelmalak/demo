/**
 * Stable error codes for RFC 9457 problem responses (API §1). Clients branch on `code`,
 * never on `title` or `detail`, so codes are never renamed once shipped.
 */
export const ERROR_CATALOGUE = {
  // Generic HTTP conditions
  BAD_REQUEST: { status: 400, title: 'Bad request' },
  VALIDATION_FAILED: { status: 400, title: 'Validation failed' },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  METHOD_NOT_ALLOWED: { status: 405, title: 'Method not allowed' },
  CONFLICT: { status: 409, title: 'Conflict' },
  GONE: { status: 410, title: 'Gone' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Payload too large' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, title: 'Unsupported media type' },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL: { status: 500, title: 'Internal error' },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Service unavailable' },

  // Idempotency (ADR-015)
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, title: 'Idempotency-Key header required' },
  IDEMPOTENCY_IN_PROGRESS: {
    status: 409,
    title: 'A request with this Idempotency-Key is in progress',
  },
  IDEMPOTENCY_MISMATCH: { status: 422, title: 'Idempotency-Key reused with a different request' },

  // Domain
  ITEM_UNAVAILABLE: { status: 409, title: 'Item unavailable' },
  TABLE_NOT_FOUND: { status: 404, title: 'Table not found' },
  TABLE_INACTIVE: { status: 410, title: 'Table inactive' },
  ORDERING_DISABLED: { status: 409, title: 'Ordering is disabled' },
  PRICE_CHANGED: { status: 409, title: 'Prices changed' },
  SESSION_CLOSED: { status: 410, title: 'Session closed' },
} as const satisfies Record<string, { status: number; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATALOGUE, value);
}

export interface ProblemFieldError {
  path: string;
  message: string;
}

/** RFC 9457 body. `requestId` lets support find the request in the logs. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  requestId?: string;
  errors?: ProblemFieldError[];
  [extension: string]: unknown;
}

export interface DomainErrorOptions {
  detail?: string;
  errors?: ProblemFieldError[];
  /** Extra members merged into the problem body, e.g. a price diff for PRICE_CHANGED. */
  extensions?: Record<string, unknown>;
}

/** Thrown by services; the API maps it to a problem response with the catalogue status. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly errors: ProblemFieldError[] | undefined;
  readonly extensions: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, options: DomainErrorOptions = {}) {
    super(options.detail ?? ERROR_CATALOGUE[code].title);
    this.name = 'DomainError';
    this.code = code;
    this.status = ERROR_CATALOGUE[code].status;
    this.detail = options.detail;
    this.errors = options.errors;
    this.extensions = options.extensions;
  }
}

/** Generic code for a bare HTTP status, used when an error carries no code of its own. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_ALLOWED';
    case 409:
      return 'CONFLICT';
    case 410:
      return 'GONE';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
  }
}
