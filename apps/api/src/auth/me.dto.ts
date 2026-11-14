import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { MEMBER_ROLES } from '@radd/shared';

export const meSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
  }),
  session: z.object({
    id: z.uuid(),
    activeOrganizationId: z.uuid().nullable(),
    pinSession: z.boolean(),
    staffDeviceId: z.uuid().nullable(),
    twoFactorVerifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  }),
  memberships: z.array(
    z.object({
      organizationId: z.uuid(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(MEMBER_ROLES),
    }),
  ),
});

export class MeDto extends createZodDto(meSchema) {}

export type Me = z.infer<typeof meSchema>;
