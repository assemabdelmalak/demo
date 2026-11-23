import { type DynamicModule, Module } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { StaffDevicesRepository } from '@radd/db';

import { deviceCookieSpec } from './device-cookie';
import { MemberPinController } from './member-pin.controller';
import { MemberPinService } from './member-pin.service';
import { PinHasher } from './pin-hasher';
import { DEFAULT_PIN_LOCKOUT, PinLockout, type PinLockoutOptions } from './pin-lockout';
import { DEVICE_COOKIE, PinSwitchService } from './pin-switch.service';
import { StaffDevicesController } from './staff-devices.controller';
import { StaffDevicesService } from './staff-devices.service';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { VALKEY } from '../valkey/valkey.module';

export interface StaffModuleOptions {
  /** Shorter lockout windows for tests; production uses `DEFAULT_PIN_LOCKOUT`. */
  pinLockout?: Partial<PinLockoutOptions>;
}

/** Shared tablets, member PINs and the PIN quick-switch (ADR-026, API §4 "Team"). */
@Module({})
export class StaffModule {
  static register(options: StaffModuleOptions = {}): DynamicModule {
    const lockout: PinLockoutOptions = { ...DEFAULT_PIN_LOCKOUT, ...options.pinLockout };
    return {
      module: StaffModule,
      controllers: [StaffDevicesController, MemberPinController],
      providers: [
        StaffDevicesService,
        MemberPinService,
        PinSwitchService,
        // The repository takes its transaction from the tenant scope, so one instance serves all.
        { provide: StaffDevicesRepository, useValue: new StaffDevicesRepository() },
        {
          provide: DEVICE_COOKIE,
          inject: [API_ENV],
          useFactory: (env: ApiEnv) => deviceCookieSpec(env.BETTER_AUTH_URL),
        },
        {
          provide: PinHasher,
          inject: [API_ENV],
          useFactory: (env: ApiEnv) => new PinHasher(env.BETTER_AUTH_SECRET),
        },
        {
          provide: PinLockout,
          inject: [VALKEY],
          useFactory: (valkey: Redis) => new PinLockout(valkey, lockout),
        },
      ],
    };
  }
}
