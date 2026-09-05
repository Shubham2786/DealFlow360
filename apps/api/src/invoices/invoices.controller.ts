import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  list() {
    return this.billing.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.billing.get(id);
  }

  @Post('from-quotation/:quotationId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.ADMIN, UserRole.SALES_MANAGER)
  generate(@Param('quotationId') quotationId: string, @CurrentUser() user: AuthUser) {
    return this.billing.generateFromQuotation(quotationId, user);
  }

  @Post(':id/payments')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  pay(@Param('id') id: string, @Body() dto: PaymentDto, @CurrentUser() user: AuthUser) {
    return this.billing.recordPayment(id, dto, user);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.billing.cancel(id, user);
  }
}
