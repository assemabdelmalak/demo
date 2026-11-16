import { createZodDto } from 'nestjs-zod';

import {
  createStaffDeviceSchema,
  listStaffDevicesQuerySchema,
  memberParamsSchema,
  pinSwitchResultSchema,
  pinSwitchSchema,
  restaurantParamsSchema,
  setMemberPinSchema,
  staffDeviceListSchema,
  staffDeviceParamsSchema,
  staffDeviceSchema,
} from '@radd/shared';

// Nest wrappers around the shared schemas in packages/shared/src/dto (one schema per DTO).
export class CreateStaffDeviceDto extends createZodDto(createStaffDeviceSchema) {}
export class StaffDeviceDto extends createZodDto(staffDeviceSchema) {}
export class StaffDeviceListDto extends createZodDto(staffDeviceListSchema) {}
export class ListStaffDevicesQueryDto extends createZodDto(listStaffDevicesQuerySchema) {}
export class StaffDeviceParamsDto extends createZodDto(staffDeviceParamsSchema) {}
export class StaffDeviceRestaurantParamsDto extends createZodDto(restaurantParamsSchema) {}
export class PinSwitchDto extends createZodDto(pinSwitchSchema) {}
export class PinSwitchResultDto extends createZodDto(pinSwitchResultSchema) {}
export class SetMemberPinDto extends createZodDto(setMemberPinSchema) {}
export class MemberParamsDto extends createZodDto(memberParamsSchema) {}
