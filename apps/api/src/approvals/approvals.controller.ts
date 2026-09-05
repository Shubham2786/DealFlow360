import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApprovalRequestStatus, UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { ApprovalsService } from './approvals.service';

class DecisionDto {
  @IsOptional() @IsString() comment?: string;
}

@Controller('approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@Query('status') status?: ApprovalRequestStatus) {
    return this.approvals.list(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.approvals.get(id);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SALES_MANAGER, UserRole.FINANCE, UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.approvals.approve(id, user, dto.comment);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SALES_MANAGER, UserRole.FINANCE, UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.approvals.reject(id, user, dto.comment);
  }

  @Post(':id/request-changes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SALES_MANAGER, UserRole.FINANCE, UserRole.ADMIN)
  requestChanges(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.approvals.requestChanges(id, user, dto.comment);
  }
}
