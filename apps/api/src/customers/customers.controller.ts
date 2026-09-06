import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CustomerSegment, Permission, UserRole } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
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
  list(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      if (!user.email) return [];
      return this.prisma.customer.findMany({
        where: { contactEmail: user.email },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const isTeam =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.MANAGER ||
      user.role === UserRole.FINANCE ||
      (user.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        quotations: isTeam
          ? true
          : user.role === UserRole.CUSTOMER
            ? false
            : { where: { OR: [{ createdById: user.id }, { salespersonId: user.id }] } },
        invoices: isTeam
          ? true
          : user.role === UserRole.CUSTOMER
            ? false
            : { where: { quotation: { OR: [{ createdById: user.id }, { salespersonId: user.id }] } } },
      },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);

    if (user.role === UserRole.CUSTOMER && user.email !== customer.contactEmail) {
      throw new ForbiddenException('Access denied: customer belongs to another organization');
    }

    return customer;
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.DEAL_CREATE)
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers cannot register new client accounts');
    }

    // Privilege check for tier assignment:
    // Only MANAGER, ADMIN, or users with SYSTEM_CONFIG_MANAGE can set high tiers (ENTERPRISE / STRATEGIC).
    const isPrivileged =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.MANAGER ||
      (user.permissions ?? []).includes(Permission.SYSTEM_CONFIG_MANAGE);

    const segment = dto.segment ?? CustomerSegment.STANDARD;
    if (!isPrivileged && (segment === CustomerSegment.ENTERPRISE || segment === CustomerSegment.STRATEGIC)) {
      throw new ForbiddenException('Only managers and administrators can assign ENTERPRISE or STRATEGIC customer tiers');
    }

    if (dto.contactEmail) {
      const existing = await this.prisma.customer.findFirst({
        where: { contactEmail: dto.contactEmail },
      });
      if (existing) {
        throw new BadRequestException(`Customer with email ${dto.contactEmail} already exists`);
      }
    }

    const customer = await this.prisma.customer.create({
      data: { ...dto, segment },
    });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Customer',
      entityId: customer.id,
      action: 'CUSTOMER_CREATED',
      message: `Customer ${customer.name} created (${segment})`,
    });
    return customer;
  }
}
