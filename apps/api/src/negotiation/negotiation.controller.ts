import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Permission } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { NegotiationService } from './negotiation.service';
import { QuotationsService } from '../quotations/quotations.service';

class ReplyDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

/** Internal (authenticated) endpoints for sharing/viewing/replying to negotiation. */
@Controller('quotations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NegotiationController {
  constructor(
    private readonly negotiation: NegotiationService,
    private readonly quotations: QuotationsService,
  ) {}

  @Post(':id/send-to-customer')
  @RequirePermissions(Permission.DEAL_CREATE)
  async sendToCustomer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    return this.negotiation.createPortalLink(id, user);
  }

  @Get(':id/negotiation')
  async thread(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.quotations.get(id, user);
    return this.negotiation.internalThread(id);
  }

  @Post(':id/negotiation/reply')
  @RequirePermissions(Permission.DEAL_CREATE)
  async reply(
    @Param('id') id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() user: AuthUser,
  ) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    return this.negotiation.replyAsSalesperson(id, dto.message, user);
  }
}

