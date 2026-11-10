import { HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

import {
  codeForStatus,
  DomainError,
  ERROR_CATALOGUE,
  type ErrorCode,
  type ProblemDetails,
  type ProblemFieldError,
} from '@radd/shared';

/** Base of the RFC 9457 `type` URI, e.g. `https://docs.raddmenu.com/errors/ITEM_UNAVAILABLE`. */
export function problemTypeBase(appDomain: string): string {
  return `https://docs.${appDomain}/errors`;
}

/** A stored problem body replayed for a repeated Idempotency-Key (ADR-015). */
export class ReplayedProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ReplayedProblem';
  }
}

export function zodFieldErrors(error: ZodError): ProblemFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

interface ProblemParts {
  detail?: string | undefined;
  errors?: ProblemFieldError[] | undefined;
  extensions?: Record<string, unknown> | undefined;
}

function build(
  code: ErrorCode,
  status: number,
  typeBase: string,
  { detail, errors, extensions }: ProblemParts = {},
): ProblemDetails {
  // Extensions first, so they can never override the members clients rely on.
  return {
    ...extensions,
    type: `${typeBase}/${code}`,
    title: ERROR_CATALOGUE[code].title,
    status,
    code,
    ...(detail ? { detail } : {}),
    ...(errors ? { errors } : {}),
  };
}

function statusOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('statusCode' in value)) return undefined;
  const { statusCode } = value;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600
    ? statusCode
    : undefined;
}

/**
 * Maps anything thrown inside a request to an RFC 9457 body. Only 4xx details reach the client;
 * 5xx responses never expose internal messages.
 */
export function toProblem(exception: unknown, typeBase: string): ProblemDetails {
  if (exception instanceof ReplayedProblem) return { ...exception.problem };

  if (exception instanceof DomainError) {
    return build(exception.code, exception.status, typeBase, {
      detail: exception.detail,
      errors: exception.errors,
      extensions: exception.extensions,
    });
  }

  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError();
    return build('VALIDATION_FAILED', 400, typeBase, {
      errors: zodError instanceof ZodError ? zodFieldErrors(zodError) : [],
    });
  }

  if (exception instanceof ThrottlerException) {
    return build('RATE_LIMITED', 429, typeBase);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForStatus(status);
    return build(code, status, typeBase, status < 500 ? { detail: exception.message } : {});
  }

  // Fastify raises plain errors with a statusCode for malformed JSON, oversized bodies, etc.
  const status = statusOf(exception);
  if (status !== undefined && status < 500 && exception instanceof Error) {
    return build(codeForStatus(status), status, typeBase, { detail: exception.message });
  }

  return build('INTERNAL', 500, typeBase);
}
