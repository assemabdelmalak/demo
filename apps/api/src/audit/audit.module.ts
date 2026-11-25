import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/** The audit log, available to every module. Needs `DbModule`, `EnvModule` and `AuthzModule`. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
