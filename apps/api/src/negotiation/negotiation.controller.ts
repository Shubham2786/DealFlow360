import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Permission } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { NegotiationService } from './negotiation.service';

/** Internal (authenticated) endpoints for sharing/viewing a negotiation. */
@Controller('quotations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NegotiationController {
  constructor(private readonly negotiation: NegotiationService) {}

  @Post(':id/send-to-customer')
  @RequirePermissions(Permission.DEAL_CREATE)
  sendToCustomer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.negotiation.createPortalLink(id, user);
  }

  @Get(':id/negotiation')
  thread(@Param('id') id: string) {
    return this.negotiation.internalThread(id);
  }
}
