import { z } from 'zod';

import { displayNameSchema } from './organizations.js';

// Shared staff devices and quick-switch PINs (ADR-026, API §2 and §4 "Team").

/** Quick-switch PINs are 4 to 6 digits (ADR-026). */
export const PIN_PATTERN = /^\d{4,6}$/;

/**
 * PINs anyone would try first, refused when a manager sets one. A short deterministic rule rather
 * than a list, so the console can explain it: one digit repeated (`0000`), a run up or down by
 * one (`1234`, `98765`), or a shorter block repeated (`1212`, `123123`). With 5 tries before a
 * lock and 15 a day before the PIN is disabled, what remains is out of reach of guessing.
 */
export function isWeakPin(pin: string): boolean {
  if (!PIN_PATTERN.test(pin)) return true;
  const digits = Array.from(pin, Number);
  const steps = digits.slice(1).map((digit, index) => digit - (digits[index] ?? digit));
  if (steps.every((step) => step === 0)) return true;
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return true;
  for (let size = 1; size <= pin.length / 2; size += 1) {
    if (pin.length % size === 0 && pin.slice(0, size).repeat(pin.length / size) === pin)
      return true;
  }
  return false;
}

/** `PUT /v1/members/{id}/pin`. */
export const setMemberPinSchema = z.strictObject({
  pin: z
    .string()
    .regex(PIN_PATTERN, 'Use 4 to 6 digits')
    .refine((pin) => !isWeakPin(pin), 'This PIN is too easy to guess'),
});
export type SetMemberPinInput = z.infer<typeof setMemberPinSchema>;

/** `:id` of a member. */
export const memberParamsSchema = z.strictObject({ id: z.uuid() });

/** `POST /v1/restaurants/{rid}/staff-devices`. */
export const createStaffDeviceSchema = z.strictObject({ name: displayNameSchema.max(60) });
export type CreateStaffDeviceInput = z.infer<typeof createStaffDeviceSchema>;

/** A registered device as the console sees it. The device token is never part of it. */
export const staffDeviceSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  lastSeenAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type StaffDeviceView = z.infer<typeof staffDeviceSchema>;

export const listStaffDevicesQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListStaffDevicesQuery = z.infer<typeof listStaffDevicesQuerySchema>;

export const staffDeviceListSchema = z.object({
  items: z.array(staffDeviceSchema),
  nextCursor: z.uuid().nullable(),
});
export type StaffDeviceList = z.infer<typeof staffDeviceListSchema>;

/** `:id` of a staff device. */
export const staffDeviceParamsSchema = z.strictObject({ id: z.uuid() });

/**
 * `POST /v1/staff-devices/{id}/switch`. The PIN is only checked for shape here; whether it is
 * right is answered with the same generic 403 as every other failure.
 */
export const pinSwitchSchema = z.strictObject({
  memberId: z.uuid(),
  pin: z.string().regex(PIN_PATTERN, 'Use 4 to 6 digits'),
});
export type PinSwitchInput = z.infer<typeof pinSwitchSchema>;

export const pinSwitchResultSchema = z.object({
  memberId: z.uuid(),
  organizationId: z.uuid(),
  restaurantId: z.uuid(),
  expiresAt: z.iso.datetime(),
});
export type PinSwitchResult = z.infer<typeof pinSwitchResultSchema>;
