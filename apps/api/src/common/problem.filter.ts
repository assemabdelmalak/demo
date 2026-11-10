import { type ArgumentsHost, Catch, type ExceptionFilter, Inject, Logger } from '@nestjs/common';
import { captureException } from '@sentry/nestjs';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ERROR_CATALOGUE, type ProblemDetails } from '@radd/shared';

import { problemTypeBase, toProblem } from './problem';
import { REQUEST_ID_HEADER } from './request-id';
import { API_ENV, type ApiEnv } from '../config/env.module';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/** Writes a problem response; anything that is not a valid 4xx/5xx status becomes a 500. */
export function sendProblem(
  reply: FastifyReply,
  request: FastifyRequest,
  problem: ProblemDetails,
  typeBase: string,
): void {
  const valid = Number.isInteger(problem.status) && problem.status >= 400 && problem.status <= 599;
  const body: ProblemDetails = valid
    ? { ...problem, requestId: request.id }
    : {
        type: `${typeBase}/INTERNAL`,
        title: ERROR_CATALOGUE.INTERNAL.title,
        status: 500,
        code: 'INTERNAL',
        requestId: request.id,
      };
  void reply
    .status(body.status)
    .header('content-type', PROBLEM_CONTENT_TYPE)
    .header(REQUEST_ID_HEADER, request.id)
    .send(body);
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');
  private readonly typeBase: string;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.typeBase = problemTypeBase(env.APP_DOMAIN);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const problem = toProblem(exception, this.typeBase);

    if (problem.status >= 500) {
      const route = request.routeOptions.url;
      this.logger.error({ err: exception, requestId: request.id, route }, 'unhandled error');
      // Only server faults reach Sentry; 4xx are expected outcomes. A no-op without a DSN.
      captureException(exception, { tags: { requestId: request.id, route: route ?? 'unmatched' } });
    }

    sendProblem(reply, request, problem, this.typeBase);
  }
}
