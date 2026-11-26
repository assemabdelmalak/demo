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
  /**
   * True only when this session would pass the super-admin guard right now (ADR-027), so the
   * console shows the admin shell to exactly the people the API lets in.
   */
  isSuperAdmin: z.boolean(),
  /** For a PIN session, only the device's organisation (ADR-026). */
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
