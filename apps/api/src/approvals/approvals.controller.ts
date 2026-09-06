import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApprovalRequestStatus, Permission, UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { ApprovalsService } from './approvals.service';

class DecisionDto {
  @IsOptional() @IsString() comment?: string;
}

@Controller('approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) { }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: ApprovalRequestStatus) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access internal approval records');
    }
    return this.approvals.list(user, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access internal approval records');
    }
    return this.approvals.get(id, user);
  }

  @Post(':id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_APPROVE)
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.approvals.approve(id, user, dto.comment);
  }

  @Post(':id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_APPROVE)
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    if (!dto.comment || !dto.comment.trim()) {
      throw new BadRequestException('A reason comment is required when rejecting an approval request');
    }
    return this.approvals.reject(id, user, dto.comment.trim());
  }

  @Post(':id/request-changes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_APPROVE)
  requestChanges(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    if (!dto.comment || !dto.comment.trim()) {
      throw new BadRequestException('A comment describing required changes is mandatory');
    }
    return this.approvals.requestChanges(id, user, dto.comment.trim());
  }
}
