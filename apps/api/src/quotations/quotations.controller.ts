import { Body, Controller, ForbiddenException, forwardRef, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditService } from '../audit/audit.service';
import { Permission, UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { QuotationsService } from './quotations.service';
import { ApprovalsService } from '../approvals/approvals.service';

class QuotationLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
}

class CreateQuotationDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() salespersonId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @IsString() expiresAt?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationLineDto)
  lines!: QuotationLineDto[];
}

class CustomerOrderLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
}

class CustomerOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerOrderLineDto)
  lines!: CustomerOrderLineDto[];
  @IsOptional() @IsString() notes?: string;
}

class ApplyCounterDiscountDto {
  @IsNumber() @Min(0) @Max(100) discountPct!: number;
  @IsOptional() @IsString() message?: string;
}

@Controller('quotations')
@UseGuards(JwtAuthGuard)
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => ApprovalsService))
    private readonly approvals: ApprovalsService,
  ) { }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.quotations.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quotations.get(id, user);
  }

  @Post('preview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  preview(@Body() dto: CreateQuotationDto) {
    return this.quotations.preview(dto);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthUser) {
    const quotation = await this.quotations.create({
      ...dto,
      salespersonId: dto.salespersonId ?? user.id,
      createdById: user.id,
    });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Quotation',
      entityId: quotation.id,
      action: 'QUOTATION_CREATED',
      message: `Quotation ${quotation.number} created`,
    });
    return quotation;
  }

  @Post('customer-order')
  async createCustomerOrder(
    @Body() dto: CustomerOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can place self-service order requests');
    }
    return this.quotations.createCustomerOrder(dto, user);
  }

  @Post(':id/submit')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    return this.approvals.submitQuotation(id, user);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    return this.quotations.cancel(id, user);
  }

  @Post(':id/revise')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async revise(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    return this.quotations.revise(id, user);
  }

  @Post(':id/apply-counter-discount')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async applyCounterDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyCounterDiscountDto,
    @CurrentUser() user: AuthUser,
  ) {
    const quote = await this.quotations.get(id, user);
    this.quotations.assertCanModify(quote, user);
    await this.quotations.applyDiscount(id, dto.discountPct, user);
    return this.approvals.submitQuotation(id, user);
  }
}
