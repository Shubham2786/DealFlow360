import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CustomerSegment } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

class CreateCustomerDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsEnum(CustomerSegment) segment?: CustomerSegment;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
}

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: { quotations: true, invoices: true },
    });
  }

  @Post()
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    const customer = await this.prisma.customer.create({
      data: { ...dto, segment: dto.segment ?? CustomerSegment.STANDARD },
    });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Customer',
      entityId: customer.id,
      action: 'CUSTOMER_CREATED',
      message: `Customer ${customer.name} created`,
    });
    return customer;
  }
}
