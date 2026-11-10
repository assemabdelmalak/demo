import { type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SchemaObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import { ERROR_CATALOGUE } from '@radd/shared';

export const DOCS_PATH = 'v1/docs';

/** RFC 9457 body shared by every error response (API §1, ADR-017). */
const PROBLEM_DETAILS_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['type', 'title', 'status', 'code'],
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer', minimum: 400, maximum: 599 },
    code: { type: 'string', enum: Object.keys(ERROR_CATALOGUE) },
    detail: { type: 'string' },
    requestId: { type: 'string', format: 'uuid' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'message'],
        properties: { path: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
  additionalProperties: true,
};

/** The OpenAPI 3.1 document for every controller, with schemas generated from the zod DTOs. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Radd Menu API')
    .setDescription(
      'REST API for the Radd Menu diner app, console and integrations. Errors are RFC 9457 problem+json.',
    )
    .setVersion('v1')
    .setOpenAPIVersion('3.1.0')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ProblemDetails: PROBLEM_DETAILS_SCHEMA },
  };
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of [
      pathItem.get,
      pathItem.put,
      pathItem.post,
      pathItem.delete,
      pathItem.patch,
    ]) {
      if (!operation) continue;
      operation.responses.default = {
        description: 'Error (RFC 9457 problem details)',
        content: {
          'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
        },
      };
    }
  }
  return document;
}
