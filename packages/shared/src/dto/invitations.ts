import { z } from 'zod';

/** Roles an invitation may carry. Nobody is invited as `owner`; ownership changes are their own flow. */
export const INVITABLE_ROLES = ['manager', 'staff', 'kitchen'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** An address as Better Auth stores it: trimmed and lower case. */
export const invitationEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** `POST /v1/invitations`. */
export const createInvitationSchema = z.strictObject({
  email: invitationEmailSchema,
  role: z.enum(INVITABLE_ROLES),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;

export const invitationSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  email: z.email(),
  role: z.enum(INVITABLE_ROLES),
  status: z.enum(INVITATION_STATUSES),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type InvitationView = z.infer<typeof invitationSchema>;
