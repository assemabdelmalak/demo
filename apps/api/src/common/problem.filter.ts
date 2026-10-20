import { type ArgumentsHost, Catch, type ExceptionFilter, Inject, Logger } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { problemTypeBase, toProblem } from './problem';
import { API_ENV, type ApiEnv } from '../config/env.module';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

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
    const problem = { ...toProblem(exception, this.typeBase), requestId: request.id };

    if (problem.status >= 500) {
      this.logger.error(
        { err: exception, requestId: request.id, route: request.routeOptions.url },
        'unhandled error',
      );
    }

    void reply.status(problem.status).header('content-type', PROBLEM_CONTENT_TYPE).send(problem);
  }
}
