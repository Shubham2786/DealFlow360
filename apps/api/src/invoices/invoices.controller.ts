import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Permission } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';

class PaymentDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() reference?: string;
}

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly billing: BillingService) { }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.billing.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.billing.get(id, user);
  }

  @Post('from-quotation/:quotationId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.FINANCE_TRANSACTION_APPROVE)
  generate(@Param('quotationId') quotationId: string, @CurrentUser() user: AuthUser) {
    return this.billing.generateFromQuotation(quotationId, user);
  }

  @Post(':id/payments')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.FINANCE_TRANSACTION_APPROVE)
  pay(@Param('id') id: string, @Body() dto: PaymentDto, @CurrentUser() user: AuthUser) {
    return this.billing.recordPayment(id, dto, user);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.FINANCE_TRANSACTION_APPROVE)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.billing.cancel(id, user);
  }
}
