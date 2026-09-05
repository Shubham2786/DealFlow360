import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Permission, ProductType } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

class CreateProductDto {
  @IsString() @MinLength(1) sku!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsNumber() @Min(0) basePrice!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  @Get()
  list() {
    return this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.SYSTEM_CONFIG_MANAGE)
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        type: dto.type ?? ProductType.ONE_TIME,
        basePrice: dto.basePrice,
        currency: dto.currency ?? 'USD',
        uom: dto.uom ?? 'unit',
        taxRate: dto.taxRate ?? 0,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Product',
      entityId: product.id,
      action: 'PRODUCT_CREATED',
      message: `Product ${product.sku} created`,
    });
    return product;
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.SYSTEM_CONFIG_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    const product = await this.prisma.product.update({ where: { id }, data: dto });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Product',
      entityId: product.id,
      action: 'PRODUCT_UPDATED',
      message: `Product ${product.sku} updated`,
    });
    return product;
  }
}
