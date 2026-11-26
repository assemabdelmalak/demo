import { createZodDto } from 'nestjs-zod';

import {
  createInvitationSchema,
  createOrganizationSchema,
  invitationSchema,
  listMembersQuerySchema,
  memberListSchema,
  organizationSchema,
  updateOrganizationSchema,
} from '@radd/shared';

// Nest wrappers around the shared schemas in packages/shared/src/dto (one schema per DTO).
export class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
export class UpdateOrganizationDto extends createZodDto(updateOrganizationSchema) {}
export class OrganizationDto extends createZodDto(organizationSchema) {}
export class ListMembersQueryDto extends createZodDto(listMembersQuerySchema) {}
export class MemberListDto extends createZodDto(memberListSchema) {}
export class CreateInvitationDto extends createZodDto(createInvitationSchema) {}
export class InvitationDto extends createZodDto(invitationSchema) {}
