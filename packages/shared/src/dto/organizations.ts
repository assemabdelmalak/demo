import { z } from 'zod';

import { MEMBER_ROLES, ORGANIZATION_STATUSES, PLAN_CODES } from '../enums.js';

/**
 * A person's or organisation's name as typed in the console. Control characters (newlines in
 * particular) are refused: names end up in email subjects and log-free audit rows.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u, 'Must not contain control characters');

/** `POST /v1/organizations` (onboarding step 0). Strict: `plan`, `status`, … are server-only. */
export const createOrganizationSchema = z.strictObject({ name: displayNameSchema });
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/** `PATCH /v1/organizations/current`. Only the name; plan, status, country and terms are not ours to set. */
export const updateOrganizationSchema = z.strictObject({ name: displayNameSchema });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  country: z.string(),
  plan: z.enum(PLAN_CODES),
  status: z.enum(ORGANIZATION_STATUSES),
  createdAt: z.iso.datetime(),
});
export type OrganizationView = z.infer<typeof organizationSchema>;

/** Members list query: cursor pagination (API §1). */
export const listMembersQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

/** A member as the console sees it. Never carries the PIN hash. */
export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(MEMBER_ROLES),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type MemberView = z.infer<typeof memberSchema>;

export const memberListSchema = z.object({
  items: z.array(memberSchema),
  nextCursor: z.uuid().nullable(),
});
export type MemberList = z.infer<typeof memberListSchema>;
