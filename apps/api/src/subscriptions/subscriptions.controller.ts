import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingFrequency, Permission } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

class SubscriptionLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsNumber() @Min(0) unitPrice!: number;
}

class CreateSubscriptionDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() quotationId?: string;
  @IsOptional() @IsEnum(BillingFrequency) frequency?: BillingFrequency;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriptionLineDto)
  lines!: SubscriptionLineDto[];
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.subscriptions.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptions.get(id, user);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.FINANCE_TRANSACTION_APPROVE)
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.create(dto, user);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptions.pause(id, user);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptions.resume(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptions.cancel(id, user);
  }
}
