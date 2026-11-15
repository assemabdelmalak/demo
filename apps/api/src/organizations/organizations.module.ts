import { Module } from '@nestjs/common';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/** Organisations, members and invitations (API §4 "Organisation" and "Team"). */
@Module({
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService, InvitationsService],
})
export class OrganizationsModule {}
