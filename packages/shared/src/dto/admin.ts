import { z } from 'zod';

import { ORGANIZATION_STATUSES, PLAN_CODES } from '../enums.js';

// Super-admin endpoints (`/v1/admin`, API §5, ADR-027).

export const adminOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  plan: z.enum(PLAN_CODES),
  status: z.enum(ORGANIZATION_STATUSES),
  memberCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type AdminOrganizationView = z.infer<typeof adminOrganizationSchema>;

/** `GET /v1/admin/orgs`: name or slug contains `search`; cursor pagination (API §1). */
export const adminListOrganizationsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminListOrganizationsQuery = z.infer<typeof adminListOrganizationsQuerySchema>;

export const adminOrganizationListSchema = z.object({
  items: z.array(adminOrganizationSchema),
  nextCursor: z.uuid().nullable(),
});
export type AdminOrganizationList = z.infer<typeof adminOrganizationListSchema>;

/** `PATCH /v1/admin/orgs/{id}`: suspend or reinstate, or change the plan. */
export const adminUpdateOrganizationSchema = z
  .strictObject({
    status: z.enum(ORGANIZATION_STATUSES).optional(),
    plan: z.enum(PLAN_CODES).optional(),
  })
  .refine((body) => body.status !== undefined || body.plan !== undefined, {
    message: 'Send status, plan or both',
  });
export type AdminUpdateOrganizationInput = z.infer<typeof adminUpdateOrganizationSchema>;

export const adminOrganizationParamsSchema = z.strictObject({ id: z.uuid() });
