import { createZodDto } from 'nestjs-zod';

import {
  adminListOrganizationsQuerySchema,
  adminOrganizationListSchema,
  adminOrganizationParamsSchema,
  adminOrganizationSchema,
  adminUpdateOrganizationSchema,
} from '@radd/shared';

// Nest wrappers around the shared schemas in packages/shared/src/dto/admin.ts.
export class AdminOrganizationDto extends createZodDto(adminOrganizationSchema) {}
export class AdminOrganizationListDto extends createZodDto(adminOrganizationListSchema) {}
export class AdminListOrganizationsQueryDto extends createZodDto(
  adminListOrganizationsQuerySchema,
) {}
export class AdminUpdateOrganizationDto extends createZodDto(adminUpdateOrganizationSchema) {}
export class AdminOrganizationParamsDto extends createZodDto(adminOrganizationParamsSchema) {}
