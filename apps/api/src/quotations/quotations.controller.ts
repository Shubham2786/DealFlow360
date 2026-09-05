import { Body, Controller, forwardRef, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { QuotationsService } from './quotations.service';
import { ApprovalsService } from '../approvals/approvals.service';

class QuotationLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discountPct?: number;
}

class CreateQuotationDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() salespersonId?: string;
  @IsOptional() @IsNumber() @Min(0) discountPct?: number;
  @IsOptional() @IsString() expiresAt?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationLineDto)
  lines!: QuotationLineDto[];
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
  list() {
    return this.quotations.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.quotations.get(id);
  }

  @Post()
  async create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthUser) {
    const quotation = await this.quotations.create({
      ...dto,
      salespersonId: dto.salespersonId ?? user.id,
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

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Submit routes the deal to approval and builds the required approval chain.
    return this.approvals.submitQuotation(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quotations.cancel(id, user);
  }

  @Post(':id/revise')
  revise(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quotations.revise(id, user);
  }
}
